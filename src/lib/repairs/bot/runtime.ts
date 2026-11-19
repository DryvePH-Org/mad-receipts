import "server-only";
import { randomBytes } from "node:crypto";
import { manilaToday } from "@/lib/dates";
import { docsDb } from "@/lib/docsbible/review-server";
import { decideRepairs, reportRepairs } from "@/lib/repairs/server";
import { createFlow } from "./flow";
import { readWithModel } from "./llm";
import type { Ports } from "./ports";
import { dbStore } from "./store";
import { repairsGroupId, telegram } from "./telegram";
import type { CarLite } from "./understand";
import { isLang } from "./texts";

// The real bot: Telegram, the database and the reading model plugged into the flow.

let carCache: { at: number; cars: CarLite[] } | null = null;
async function cars(): Promise<CarLite[]> {
  if (carCache && Date.now() - carCache.at < 60_000) return carCache.cars;
  const { data } = await docsDb().from("docs_units").select("plate_no, plate_display, make, model_variant, year_model").is("archived_at", null).order("arrival_date", { ascending: false, nullsFirst: false }).limit(5000);
  const seen = new Set<string>(), out: CarLite[] = [];
  for (const u of data ?? []) {
    const plate = u.plate_no as string;
    if (seen.has(plate)) continue;
    seen.add(plate);
    out.push({ plate, display: ((u.plate_display as string | null) || plate).toUpperCase(), label: [u.make, u.model_variant].filter(Boolean).join(" ") });
  }
  carCache = { at: Date.now(), cars: out };
  return out;
}

export function realPorts(): Ports {
  const envLang = process.env.REPAIRS_DEFAULT_LANGUAGE;
  return {
    tg: telegram, store: dbStore(), groupChatId: repairsGroupId(), defaultLang: isLang(envLang) ? envLang : "en",
    today: () => manilaToday(),
    nowText: () => new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    newId: () => randomBytes(4).toString("hex"),
    caps: { jobs: Number(process.env.REPAIRS_DAILY_JOB_CAP) || 400, voice: Number(process.env.REPAIRS_DAILY_VOICE_CAP) || 200 },
    read: readWithModel,
    cars,
    async vocabulary() {
      const { data } = await docsDb().from("car_repairs").select("supplier, company").not("supplier", "is", null).limit(500);
      const uniq = (k: "supplier" | "company") => [...new Set((data ?? []).map((r) => String(r[k] ?? "").trim()).filter((x) => x && !/^(n\/a|tbc|mad)$/i.test(x)))];
      return { suppliers: uniq("supplier"), companies: uniq("company") };
    },
    async saveReport(d) {
      if (!d.data) return { ok: false, error: "The report is empty." };
      const r = await reportRepairs({
        plate: d.data.plate, vehicle: d.data.vehicle, ym: d.data.year_model, reportId: `R${d.id}-${d.round}`, reportedBy: d.ownerName, reportedTg: d.ownerId, source: "bot", draftId: d.id,
        items: d.data.items.map((it) => ({ problem: it.problem, reportedOn: it.reported_on, solution: it.solution, supplier: it.supplier, company: it.company, estTimeline: it.est_timeline })),
      }, { name: d.ownerName });
      return r.ok ? { ok: true } : r;
    },
    async decide(d, approve, by, reason) {
      const { data: jobs } = await docsDb().from("car_repairs").select("id").eq("report_id", `R${d.id}-${d.round}`);
      const ids = (jobs ?? []).map((j) => j.id as string);
      if (!ids.length) return { ok: false, error: "The report's jobs were not found." };
      const r = await decideRepairs(ids, approve, reason, { name: by.name });
      return r.ok ? { ok: true } : r;
    },
  };
}

export const realFlow = () => createFlow(realPorts());

/** The Approver decided on the Repairs page: the report's card in Telegram follows (and the group is told). Never throws: the decision is already saved. */
export async function announceWebDecision(ids: string[], approve: boolean, reason: string, byName: string): Promise<void> {
  try {
    if (!process.env.REPAIRS_TELEGRAM_BOT_TOKEN) return;
    const { data } = await docsDb().from("car_repairs").select("draft_id").in("id", ids).not("draft_id", "is", null);
    const draftIds = [...new Set((data ?? []).map((r) => r.draft_id as string))];
    const ports = realPorts(), flow = createFlow(ports);
    for (const id of draftIds) {
      const won = await ports.store.claim(id, ["pending"], approve ? "approved" : "rejected");
      if (!won) continue;
      won.decidedBy = byName; won.decidedAt = ports.nowText(); won.comment = reason.trim().slice(0, 300); won.selfApproved = false;
      await ports.store.saveDraft(won);
      await flow.finishDecision(won);
    }
  } catch (e) { console.warn(`[repairs-bot] could not update Telegram after a decision: ${e instanceof Error ? e.message : "unknown"}`); }
}
