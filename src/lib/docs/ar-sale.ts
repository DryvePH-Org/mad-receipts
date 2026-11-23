import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { addTransfer } from "@/lib/transfers/server";
import { detectionsOf, type Car } from "./car";
import { saleOfPlate } from "./service";

/**
 * Sales photograph the signed AR and upload it: once the bot has read it, a car with no sale gets its sale from it (the buyer and the date
 * written on the AR, and the uploader as the salesperson when they are in Sales). The agreed price is not on an AR, so it stays blank to fill in later.
 * Only a car with no sale and no AR in the app is touched, and only by an AR that was uploaded in the app; running it again does nothing.
 */
export async function saleFromAr(car: Car): Promise<{ buyer: string } | null> {
  if (car.folder.deal_id) return null;
  const key = car.folder.plate_no;
  const admin = createAdminClient();
  if (await saleOfPlate(admin, key)) return null;
  for (const f of [...car.files].filter((x) => x.source === "upload").sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const ar = detectionsOf(f.details)?.find((d) => d.type === "acknowledgement_receipt" && d.buyerName?.trim());
    if (!ar) continue;
    const { data: who } = f.uploaded_by ? await admin.from("profiles").select("full_name, role").eq("id", f.uploaded_by).maybeSingle() : { data: null };
    const seller = who?.role === "sales" ? who.full_name ?? "" : "";
    const soldOn = ar.documentDate ?? new Date(f.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    const error = await addTransfer(key, { particular: "", financing: "", buyer: ar.buyerName!.trim(), address: "", contact: "", crDate: "", transactionDate: "", liaison: "", sales: seller, balance: "", note: "Added from the uploaded AR.", doneOn: "", soldOn, agreedPrice: "", route: "unknown", stage: "in_process", originalsAt: "", nextStep: "" }, f.uploaded_by ?? "");
    if (error) throw new Error(`The sale could not be added from the AR: ${error}`);
    await admin.from("audit_logs").insert({ actor_id: f.uploaded_by, action: "docs.sale_from_ar", entity: "unit_folder", entity_id: null, after: { plate: key, buyer: ar.buyerName!.trim() } });
    return { buyer: ar.buyerName!.trim() };
  }
  return null;
}
