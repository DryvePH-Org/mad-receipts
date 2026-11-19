import "server-only";
import { formatDate } from "@/lib/dates";
import { pesos } from "@/lib/deals";
import { dealStatusKey } from "@/lib/deal/status";
import { manilaToday } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl, nameOf, tell } from "./index";

// The messages that go out the moment something happens. Each one only reads what it needs and never throws.

interface DealLine { id: string; dealNo: string; buyer: string; units: string; owner: string; settled: boolean; released: boolean }

async function dealLine(dealId: string): Promise<DealLine | null> {
  const { data } = await createAdminClient().from("deal_summaries").select("id, deal_no, buyer_name, units, created_by, balance, due_date, sale_type, loan_status, status").eq("id", dealId).maybeSingle();
  if (!data) return null;
  const units = (Array.isArray(data.units) ? (data.units as { plate?: string; make_type?: string }[]).map((u) => u.make_type || u.plate || "") : []).filter(Boolean).join(", ");
  const key = dealStatusKey({ status: data.status, balance: Math.round(Number(data.balance) * 100), due_date: data.due_date, sale_type: data.sale_type, loan_status: data.loan_status }, manilaToday());
  return { id: data.id, dealNo: data.deal_no, buyer: data.buyer_name, units, owner: data.created_by, settled: key === "settled", released: data.loan_status === "released" };
}

/** A new receipt is waiting: tell the Approvers. */
export async function receiptSubmitted(receiptId: string): Promise<void> {
  try {
    const { data: r } = await createAdminClient().from("receipts").select("receipt_no, amount, kind, deal_id, submitted_by").eq("id", receiptId).maybeSingle();
    if (!r) return;
    const [deal, who] = await Promise.all([dealLine(r.deal_id), nameOf(r.submitted_by)]);
    await tell({ category: "receipt_waiting", except: r.submitted_by, text: `🧾 Receipt waiting for approval\n${r.receipt_no} · ${pesos(r.amount)}\n${deal ? `${deal.buyer} · ${deal.units || deal.dealNo}` : ""}\nFrom ${who}.\n${appUrl("/approvals")}` });
  } catch (e) { console.warn(`[notify] receipt_waiting: ${e instanceof Error ? e.message : "unknown"}`); }
}

/** The Approver decided: tell the person who wrote it, and the deal's owner when the deal is now settled. */
export async function receiptDecided(receiptId: string, approved: boolean, reason?: string): Promise<void> {
  try {
    const { data: r } = await createAdminClient().from("receipts").select("receipt_no, amount, deal_id, submitted_by, reject_reason").eq("id", receiptId).maybeSingle();
    if (!r) return;
    const deal = await dealLine(r.deal_id);
    const what = `${r.receipt_no} · ${pesos(r.amount)}${deal ? ` · ${deal.buyer}` : ""}`;
    await tell({ category: "receipt_result", userIds: [r.submitted_by], text: approved ? `✅ Receipt approved\n${what}\n${appUrl(`/deals/${r.deal_id}`)}` : `❌ Receipt rejected\n${what}\nReason: ${reason || r.reject_reason || "none given"}\nFill in a new receipt.\n${appUrl("/new")}` });
    if (approved && deal?.settled) await tell({ category: "deal_settled", userIds: [deal.owner], dedupe: `settled:${deal.id}`, text: `💰 Deal settled\n${deal.dealNo} · ${deal.buyer}${deal.units ? ` · ${deal.units}` : ""}\nThe balance is fully paid.\n${appUrl(`/deals/${deal.id}`)}` });
  } catch (e) { console.warn(`[notify] receipt_result: ${e instanceof Error ? e.message : "unknown"}`); }
}

/** The loan was marked released: the deal's owner is told (and when that settles the deal, it says so). */
export async function loanReleased(dealId: string): Promise<void> {
  try {
    const deal = await dealLine(dealId);
    if (!deal) return;
    await tell({ category: "deal_settled", userIds: [deal.owner], dedupe: `released:${deal.id}`, text: `🏦 Loan released\n${deal.dealNo} · ${deal.buyer}${deal.units ? ` · ${deal.units}` : ""}${deal.settled ? "\nThe deal is settled." : ""}\n${appUrl(`/deals/${deal.id}`)}` });
  } catch (e) { console.warn(`[notify] loan released: ${e instanceof Error ? e.message : "unknown"}`); }
}

/** A receipt was voided or a deal cancelled: the Admins hear who did it. */
export async function voidedOrCancelled(kind: "void" | "cancel", actorId: string, what: { receiptId?: string; dealId?: string; reason: string }): Promise<void> {
  try {
    const admin = createAdminClient();
    const who = await nameOf(actorId);
    let line = "";
    if (what.receiptId) {
      const { data: r } = await admin.from("receipts").select("receipt_no, amount, deal_id").eq("id", what.receiptId).maybeSingle();
      const deal = r ? await dealLine(r.deal_id) : null;
      line = r ? `Receipt ${r.receipt_no} · ${pesos(r.amount)}${deal ? ` · ${deal.buyer}` : ""}` : "A receipt";
    } else if (what.dealId) {
      const deal = await dealLine(what.dealId);
      line = deal ? `Deal ${deal.dealNo} · ${deal.buyer}${deal.units ? ` · ${deal.units}` : ""}` : "A deal";
    }
    await tell({ category: "void_cancel", except: actorId, text: `${kind === "void" ? "🗑️ Receipt voided" : "🚫 Deal cancelled"} by ${who}\n${line}\nReason: ${what.reason || "none given"}` });
  } catch (e) { console.warn(`[notify] void/cancel: ${e instanceof Error ? e.message : "unknown"}`); }
}

export const userChanged = (actorId: string, text: string) => nameOf(actorId).then((who) => tell({ category: "user_change", except: actorId, text: `👤 ${text}\nBy ${who}.` }));

/** A new car was added in MAD: Documentation hears it, unless they added it themselves. */
export const carAdded = async (plate: string, name: string, actorId: string) => tell({ category: "car_added", except: actorId, text: `🚗 New car added by ${await nameOf(actorId)}\n${name} (${plate})\n${appUrl(`/documents/${plate}`)}` });

/** Sales put sold papers on a car: Documentation hears it once an hour per car, not once per photo. */
export const soldPapersAdded = async (plate: string, name: string, actorId: string) => tell({ category: "sold_papers_added", except: actorId, dedupe: `sold-added:${plate}:${new Date().toISOString().slice(0, 13)}`, text: `📷 Sold papers added by ${await nameOf(actorId)}\n${name} (${plate})\n${appUrl(`/documents/${plate}`)}` });

/** A photo upload failed because Drive (the Apps Script) did not work, not because of what the person typed: the Admins hear it, at most once an hour. */
export async function driveProblem(message: string): Promise<void> {
  if (!/Apps Script|Could not reach|did not answer|Script error|DOC_|script is still|Drive/i.test(message)) return;
  await tell({ category: "system_alert", dedupe: `alert:drive:${new Date().toISOString().slice(0, 13)}`, text: `🚨 A document upload to Google Drive failed.\n${message.slice(0, 300)}\nCheck the Apps Script deployment and Admin → Go-live check.\n${appUrl("/admin/golive")}` });
}

export const dateLine = (iso: string) => formatDate(iso.slice(0, 10));
