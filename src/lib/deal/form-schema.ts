import { z } from "zod";

// The shape the server accepts for a filled-in form. Amounts stay strings; the database does the math.
const proof = z.object({ path: z.string().min(1).max(300), filename: z.string().max(200), mime: z.string().max(100), size: z.number().int().min(0).max(50_000_000) });
const text = (max = 300) => z.string().max(max);

export const formStateSchema = z.object({
  receiptNo: text(40), date: text(10), receivedFrom: text(120), contact: text(40), address: text(300),
  kind: z.enum(["earnest", "partial", "full"]),
  units: z.array(z.object({ makeType: text(150), plate: text(20), color: text(60) })).min(1).max(10),
  price: text(20), sale: z.enum(["cash", "financing"]), institution: text(100), dp: text(20), fee: text(20), monthly: text(20), years: text(5),
  hasTi: z.boolean(), ti: z.object({ year: text(10), unit: text(150), plate: text(20), mileage: text(20), value: text(20) }),
  hasLieu: z.boolean(), lieuAmount: text(20), lieuUntil: text(10),
  dueMode: z.enum(["date", "text"]), dueDate: text(10), dueText: text(150),
  earlier: text(20), cash: text(20), cashProofs: z.array(proof).max(10),
  methods: z.array(z.object({ type: z.enum(["check", "wallet"]), name: text(60), amount: text(20), ref: text(60), checkNo: text(30), bank: text(60), branch: text(60), proofs: z.array(proof).max(10) })).max(20),
  payout: text(20), payoutProofs: z.array(proof).max(10),
  hasRem: z.boolean(), remarks: text(2000), notes: z.array(z.object({ text: text(300), on: z.boolean() })).max(30),
});
