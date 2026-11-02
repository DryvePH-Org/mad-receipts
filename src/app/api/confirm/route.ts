import { after } from "next/server";
import { z } from "zod";
import { inventory, inventoryErrorMessage } from "@/lib/inventory";
import { fromCentavos, MAX_CENTAVOS, toCentavos } from "@/lib/rules/money";
import { dealStatusForBalance, unitStatusForDeal } from "@/lib/rules/payment";
import { normalizePlate } from "@/lib/rules/validate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { processDueJobs } from "@/lib/sync/process";

const text = (max: number) => z.string().trim().max(max).nullable();
const money = z.number().int().min(0).max(MAX_CENTAVOS).nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const Body = z.object({
  draftId: z.uuid(),
  markedReservation: z.boolean(),
  fields: z.object({
    receipt_no: text(20),
    receipt_date: date,
    buyer_name: text(200),
    buyer_address: text(300),
    buyer_contact: text(50),
    amount_words: text(300),
    amount: money,
    paper_payment_type: z.enum(["earnest", "partial", "full"]).nullable(),
    make_type: text(100),
    plate_no: text(20),
    motor_no: text(50),
    chassis_no: text(50),
    color: text(50),
    agreed_price: money,
    payment_method: z.enum(["cash", "check"]).nullable(),
    check_no: text(50),
    bank_branch: text(100),
    balance_words: text(300),
    balance_due_date: date,
  }),
});

// confirm_receipt raises short codes; these are what staff see.
const ERRORS: Record<string, [string, number]> = {
  draft_not_found: ["This upload was not found. Please upload the photo again.", 404],
  draft_already_confirmed: ["This receipt was already confirmed.", 409],
  draft_not_ready: ["The photo is still being read. Wait a moment and try again.", 409],
  invalid_receipt_no: ["The receipt number should be letters and numbers only, e.g. 2556.", 422],
  missing_plate: ["Enter the plate number.", 422],
  invalid_amount: ["Enter an amount greater than zero.", 422],
  missing_buyer_name: ["Enter the buyer's name.", 422],
  invalid_agreed_price: ["Enter the agreed price.", 422],
  overpayment: ["This payment is more than the remaining balance.", 422],
};

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Not logged in", 401);

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail("Some fields are not valid. Please check the form.", 400);
  const { draftId, markedReservation, fields } = body.data;

  // The plate must exist in the inventory sheet before anything is saved.
  const plate = normalizePlate(fields.plate_no);
  if (!plate) return fail(ERRORS.missing_plate[0], 422);
  let unit;
  try {
    unit = await inventory.getUnit(plate);
  } catch (err) {
    return fail(inventoryErrorMessage(err), 503);
  }
  if (!unit) {
    return fail("Plate not found in the inventory sheet. Check the plate, or add the unit to the sheet first.", 422);
  }

  const toPesos = (c: number | null) => (c === null ? null : fromCentavos(c));
  const payload = {
    ...fields,
    plate_no: plate,
    amount: toPesos(fields.amount),
    agreed_price: toPesos(fields.agreed_price),
    marked_reservation: markedReservation,
  };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("confirm_receipt", {
    p_actor: user.id,
    p_draft_id: draftId,
    p_payload: payload,
  });
  if (error) {
    if (error.code === "23505" || error.message === "duplicate_receipt_no") {
      return fail(`Receipt No. ${fields.receipt_no} is already saved. Check the number on the paper.`, 409);
    }
    const known = ERRORS[error.message];
    if (known) return fail(...known);
    console.error(`[confirm] draft=${draftId} failed code=${error.code}`);
    return fail("Could not save the receipt. Please try again.", 500);
  }

  const result = data as {
    receipt_id: string;
    receipt_no: string;
    payment_type: "earnest" | "partial" | "full";
    balance_after: number;
    deal_id: string;
    total_paid: number;
    agreed_price: number;
    new_deal: boolean;
  };

  // Move the photo next to its receipt. If this fails the receipt keeps the draft path.
  const { data: draft } = await admin.from("receipt_drafts").select("photo_path").eq("id", draftId).single();
  if (draft) {
    const receiptPath = `receipts/${result.receipt_no}.jpg`;
    const moved = await admin.storage.from("receipt-photos").move(draft.photo_path, receiptPath);
    if (!moved.error) {
      await admin.from("receipts").update({ photo_path: receiptPath }).eq("id", result.receipt_id);
    }
  }

  const balanceAfter = toCentavos(result.balance_after) ?? 0;
  const dealStatus = dealStatusForBalance(balanceAfter);
  console.info(`[confirm] draft=${draftId} receipt=${result.receipt_id} status=confirmed`);

  // Start this receipt's Drive/Sheets/Telegram/inventory sync after responding, so it feels
  // instant. Failures stay queued for the cron run; they never affect the saved receipt.
  after(() =>
    processDueJobs({ receiptId: result.receipt_id }).catch((err) =>
      console.error(`[sync] after-confirm run failed: ${err instanceof Error ? err.message : "unknown"}`),
    ),
  );

  return Response.json({
    receiptId: result.receipt_id,
    receiptNo: result.receipt_no,
    paymentType: result.payment_type,
    balanceAfter,
    totalPaid: toCentavos(result.total_paid),
    agreedPrice: toCentavos(result.agreed_price),
    dealId: result.deal_id,
    dealStatus,
    unitStatus: unitStatusForDeal(dealStatus),
    newDeal: result.new_deal,
  });
}
