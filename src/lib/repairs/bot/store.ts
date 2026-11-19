import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import type { Draft, DraftState } from "./draft";
import type { AwaitKind, Person, PersonRole, Store } from "./ports";
import { isLang, type Lang } from "./texts";

// The bot's memory in the app's database (migration 43): people, drafts, what it waits for, the updates already handled, the daily counts.

const personOf = (r: Record<string, unknown>): Person => ({ tgId: Number(r.tg_id), name: r.name as string, role: r.role as PersonRole, lang: isLang(r.lang) ? r.lang : null });
const draftOf = (r: Record<string, unknown>): Draft => ({ ...(r.data as Draft), id: r.id as string, state: r.state as DraftState });

export function dbStore(): Store {
  const db = () => docsDb();
  return {
    async person(tgId) {
      const { data } = await db().from("repair_people").select("tg_id, name, role, lang").eq("tg_id", tgId).eq("active", true).maybeSingle();
      return data ? personOf(data) : null;
    },
    async approvers() {
      const { data } = await db().from("repair_people").select("tg_id, name, role, lang").in("role", ["approver", "admin"]).eq("active", true);
      return (data ?? []).map(personOf);
    },
    async setLang(tgId, lang) { await db().from("repair_people").update({ lang, updated_at: new Date().toISOString() }).eq("tg_id", tgId); },
    async groupLang() {
      const { data } = await db().from("repair_bot_kv").select("value").eq("key", "group_lang").maybeSingle();
      return isLang(data?.value) ? (data!.value as Lang) : null;
    },
    async setGroupLang(lang) { await db().from("repair_bot_kv").upsert({ key: "group_lang", value: lang }); },
    async saveDraft(d) {
      const { error } = await db().from("repair_bot_drafts").upsert({ id: d.id, owner_tg: d.ownerId, chat_id: d.chatId, state: d.state, data: d, updated_at: new Date().toISOString() });
      if (error) throw new Error(`The draft could not be saved: ${error.message}`);
    },
    async getDraft(id) {
      const { data } = await db().from("repair_bot_drafts").select("id, state, data").eq("id", id).maybeSingle();
      return data ? draftOf(data) : null;
    },
    async claim(id, from, to) {
      const { data } = await db().from("repair_bot_drafts").update({ state: to, updated_at: new Date().toISOString() }).eq("id", id).in("state", from).select("id, state, data");
      return data?.[0] ? draftOf(data[0]) : null;
    },
    async setAwaiting(kind, chatId, userId, ref) { await db().from("repair_bot_awaiting").upsert({ kind, chat_id: chatId, user_id: userId, ref, created_at: new Date().toISOString() }); },
    async takeAwaiting(kind: AwaitKind, chatId, userId) {
      const { data } = await db().from("repair_bot_awaiting").delete().eq("kind", kind).eq("chat_id", chatId).eq("user_id", userId).select("ref");
      return data?.[0] ? ((data[0].ref as string | null) ?? null) : undefined;
    },
    async hasAwaiting(kind, chatId, userId) {
      const { data } = await db().from("repair_bot_awaiting").select("kind").eq("kind", kind).eq("chat_id", chatId).eq("user_id", userId).maybeSingle();
      return !!data;
    },
    async firstTime(updateId) {
      const { error } = await db().from("repair_bot_updates").insert({ update_id: updateId });
      if (!error) { if (Math.random() < 0.02) await db().from("repair_bot_updates").delete().lt("received_at", new Date(Date.now() - 7 * 86_400_000).toISOString()); return true; }
      return error.code !== "23505";                 // already seen: skip. Any other trouble: handle it anyway rather than lose a report
    },
    async mute(jobId, day) { await db().from("repair_bot_kv").upsert({ key: `mute:${jobId}`, value: day }); },
    async takeCap(kind, cap) {
      const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);   // Manila day
      const { data } = await db().from("repair_bot_usage").select("n").eq("day", day).eq("kind", kind).maybeSingle();
      if ((data?.n as number | undefined ?? 0) >= cap) return false;
      await db().from("repair_bot_usage").upsert({ day, kind, n: (data?.n as number | undefined ?? 0) + 1 });
      return true;
    },
  };
}
