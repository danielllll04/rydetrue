import { z } from "zod";

// Bounded integer cents keep every supported line-item sum safely integral.
export const fareCentsSchema = z.number().int().min(0).max(1_000_000_000);
const identity = {
  caseCode: z.string().min(1),
  currency: z.literal("SGD"),
  quoteId: z.string().min(1),
};
const extra = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1).max(500),
    amountCents: fareCentsSchema,
  })
  .strict();
export const fareQuoteSchema = z
  .object({
    type: z.literal("FARE_QUOTE"),
    ...identity,
    pricingMode: z.literal("FIXED_UPFRONT"),
    quotedCents: fareCentsSchema.positive(),
    acceptedAt: z.string().datetime(),
  })
  .strict();
export const fareReceiptSchema = z
  .object({
    type: z.literal("FARE_RECEIPT"),
    ...identity,
    receiptId: z.string().min(1),
    baseFareCents: fareCentsSchema,
    chargedCents: fareCentsSchema,
    extras: z.array(extra).max(20),
    chargedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.extras.map((e) => e.id)).size !== value.extras.length)
      ctx.addIssue({ code: "custom", message: "Duplicate receipt extra IDs." });
    if (
      value.baseFareCents +
        value.extras.reduce((sum, e) => sum + e.amountCents, 0) !==
      value.chargedCents
    )
      ctx.addIssue({
        code: "custom",
        message: "Receipt line items must equal the actual charged amount.",
      });
  });
export const fareAdjustmentSchema = z
  .object({
    type: z.literal("FARE_ADJUSTMENT_RECORD"),
    ...identity,
    receiptId: z.string().min(1),
    providerName: z.string().min(1).max(200),
    verification: z.enum(["VERIFIED", "UNVERIFIED"]),
    complete: z.boolean(),
    reviewedAt: z.string().datetime(),
    extras: z
      .array(
        z
          .object({
            id: z.string().min(1),
            permitted: z.boolean(),
            permittedCents: fareCentsSchema,
            reason: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.extras.map((e) => e.id)).size !== value.extras.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate authorization extra IDs.",
      });
    if (value.extras.some((e) => !e.permitted && e.permittedCents !== 0))
      ctx.addIssue({
        code: "custom",
        message: "An unpermitted extra cannot have a permitted amount.",
      });
  });
export const fareEvidenceSchema = z.union([
  fareQuoteSchema,
  fareReceiptSchema,
  fareAdjustmentSchema,
]);
export type FareEvidence = z.infer<typeof fareEvidenceSchema>;
export const FARE_EVIDENCE_TYPES = [
  "FARE_QUOTE",
  "FARE_RECEIPT",
  "FARE_ADJUSTMENT_RECORD",
] as const;
