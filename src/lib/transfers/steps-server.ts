import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliver, release } from "./handoff";

const log = (actor: string, action: string, plate: string, after: object) =>
  createAdminClient().from("audit_logs").insert({ actor_id: actor, action, entity: "unit_folder", entity_id: null, after: { plate, ...after } as never });

export async function releaseTransfer(plate: string, to: string, on: string, actor: string): Promise<void> {
  await release(plate, to, on, actor);
  await log(actor, "docs.transfer_released", plate, { to, on });
}
export async function deliverTransfer(plate: string, on: string, actor: string): Promise<void> {
  await deliver(plate, on, actor);
  await log(actor, "docs.transfer_delivered", plate, { on });
}
