import { isPositiveMoney, parseMoney } from "@/lib/pcf/money";
import { z } from "zod";

import { labelText } from "@/lib/pcf/validators/text";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const moneyField = z
  .string()
  .trim()
  .regex(
    /^\d{1,10}(?:\.\d{1,2})?$/,
    "Enter an amount with up to 2 decimals",
  )
  .refine(isPositiveMoney, "Amount must be greater than 0");

export const fundFormSchema = z
  .object({
    name: labelText(80, "Fund name is required"),
    amount: moneyField,
    per_txn_limit: moneyField,
    approval_threshold: moneyField,
    low_balance_pct: z
      .number({ error: "Enter a whole number" })
      .int("Enter a whole number")
      .min(1, "Use 1 to 100")
      .max(100, "Use 1 to 100"),
    custodian_ids: z
      .array(z.string().regex(uuidPattern, "Select a valid custodian"))
      .max(20, "A fund can have at most 20 custodians"),
  })
  .superRefine((value, context) => {
    const limit = parseMoney(value.per_txn_limit);
    const amount = parseMoney(value.amount);
    if (limit !== null && amount !== null && limit > amount) {
      context.addIssue({
        code: "custom",
        path: ["per_txn_limit"],
        message: "Per-transaction limit cannot exceed the fund amount",
      });
    }
  });

export const saveFundSchema = fundFormSchema.extend({
  id: z.string().regex(uuidPattern).optional(),
  confirmAmountChange: z.boolean().optional(),
});

export type FundFormValues = z.infer<typeof fundFormSchema>;
export type SaveFundInput = z.infer<typeof saveFundSchema>;
