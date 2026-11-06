import { z } from "zod";

import { text } from "@/lib/pcf/validators/text";

export const replenishmentIdSchema = z.uuid();

export const createReplenishmentSchema = z.object({
  fund_id: z.uuid("Choose a fund."),
});

export type CreateReplenishmentValues = z.infer<
  typeof createReplenishmentSchema
>;

export const replenishmentReviewSchema = z
  .object({
    replenishment_id: z.uuid(),
    approve: z.boolean(),
    note: text({ max: 300, multiline: true, tooLongMessage: "Keep the note under 300 characters." }),
  })
  .refine((value) => value.approve || value.note.length > 0, {
    message: "Explain why this replenishment is being rejected.",
    path: ["note"],
  });

export type ReplenishmentReviewValues = z.infer<
  typeof replenishmentReviewSchema
>;
