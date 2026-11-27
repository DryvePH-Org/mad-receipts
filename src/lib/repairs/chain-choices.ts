import "server-only";
import { ROLE_LABELS } from "@/lib/navigation";
import { allLinks, notifyDb } from "@/lib/notify/store";
import { editsCars, roleFromDb } from "@/lib/roles";

/** The people who can be put in the approval chain (those who decide on repairs), and whether each has connected Telegram. */
export async function loadChainChoices(): Promise<{ userId: string; name: string; role: string; connected: boolean }[]> {
  const [{ data }, links] = await Promise.all([notifyDb().from("profiles").select("id, full_name, role").limit(500), allLinks()]);
  const connected = new Set(links.map((l) => l.userId));
  return (data ?? [])
    .filter((p) => editsCars(roleFromDb(p.role)))
    .map((p) => ({ userId: String(p.id), name: (p.full_name as string | null)?.trim() || "Unnamed", role: ROLE_LABELS[roleFromDb(p.role)], connected: connected.has(String(p.id)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
