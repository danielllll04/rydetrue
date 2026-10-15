import { z } from "zod";
import { fareEvidenceSchema, type FareEvidence } from "./fare-contracts";
import type { EvidenceGroup } from "./evidence";
import type { SufficiencyResult } from "./sufficiency";
import type { Citation, EvaluationResult } from "./policy";

export const FARE_POLICY_CODE = "FARE_RECONCILIATION_SG";
const ruleSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    when: z.object({ excessCharge: z.enum(["POSITIVE", "ZERO"]) }).strict(),
    then: z
      .object({
        outcome: z.enum(["REFUND_PARTIAL", "NO_REFUND"]),
        refund: z.enum(["EXCESS", "NONE"]),
        note: z.string().min(1),
      })
      .strict(),
  })
  .strict()
  .refine(
    (r) =>
      r.when.excessCharge === "POSITIVE"
        ? r.then.outcome === "REFUND_PARTIAL" && r.then.refund === "EXCESS"
        : r.then.outcome === "NO_REFUND" && r.then.refund === "NONE",
    "Policy action must match its computed condition.",
  );
export const farePolicyRulesSchema = z
  .object({
    rules: z.array(ruleSchema).min(1).max(2),
    fallback: z
      .object({
        outcome: z.literal("ESCALATE_FOR_REVIEW"),
        note: z.string().min(1),
      })
      .strict(),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.rules.map((r) => r.id)).size === value.rules.length &&
      new Set(value.rules.map((r) => r.when.excessCharge)).size ===
        value.rules.length,
    "Duplicate policy rules.",
  );
export const FARE_POLICY_RULES = farePolicyRulesSchema.parse({
  rules: [
    {
      id: "SG-FARE-R1",
      description:
        "Verified charges exceed the accepted fare plus permitted extras.",
      when: { excessCharge: "POSITIVE" },
      then: {
        outcome: "REFUND_PARTIAL",
        refund: "EXCESS",
        note: "Recommend only the computed excess; a person must approve any simulated refund.",
      },
    },
    {
      id: "SG-FARE-R2",
      description:
        "The charged amount does not exceed the accepted fare plus permitted extras.",
      when: { excessCharge: "ZERO" },
      then: {
        outcome: "NO_REFUND",
        refund: "NONE",
        note: "No evidenced overcharge is refundable under this fictional fixed-fare policy.",
      },
    },
  ],
  fallback: {
    outcome: "ESCALATE_FOR_REVIEW",
    note: "No supported fare rule matched; human review is required.",
  },
});
export interface FareMetrics {
  quotedCents: number;
  permittedExtrasCents: number;
  allowedCents: number;
  chargedCents: number;
  excessCents: number;
}
export interface FareInput {
  caseCode: string;
  currency: string;
  tripStatus: string;
  chargedCents: number;
  hasRiderStatement: boolean;
  hasDriverStatement: boolean;
  groups: EvidenceGroup[];
}
export interface FareAssessment {
  sufficiency: SufficiencyResult;
  metrics: FareMetrics | null;
  citations: Citation[];
}

/** Pure verification and reconciliation. GPS/route length never decides a charge. */
export function assessFare(input: FareInput): FareAssessment {
  const reasons: string[] = [],
    missing: string[] = [],
    conflicts: string[] = [];
  if (!input.hasRiderStatement) missing.push("RIDER_STATEMENT");
  if (!input.hasDriverStatement) missing.push("DRIVER_STATEMENT");
  if (input.tripStatus !== "COMPLETED")
    conflicts.push("Fare reconciliation requires a completed trip.");
  if (
    input.currency !== "SGD" ||
    !Number.isSafeInteger(input.chargedCents) ||
    input.chargedCents < 0 ||
    input.chargedCents > 1_000_000_000
  )
    conflicts.push("Unsupported currency or invalid trip charge.");
  const records: FareEvidence[] = [],
    citations: Citation[] = [];
  for (const type of [
    "FARE_QUOTE",
    "FARE_RECEIPT",
    "FARE_ADJUSTMENT_RECORD",
  ] as const) {
    const groups = input.groups.filter((g) => g.type === type);
    if (!groups.length) {
      missing.push(type);
      continue;
    }
    if (groups.length !== 1) {
      conflicts.push(`Ambiguous ${type} evidence groups.`);
      continue;
    }
    const group = groups[0],
      parsed = fareEvidenceSchema.safeParse(group.latest.payload);
    const expectedSource =
      type === "FARE_ADJUSTMENT_RECORD" ? "THIRD_PARTY" : "PLATFORM";
    if (
      !parsed.success ||
      parsed.data.type !== type ||
      group.source !== expectedSource
    ) {
      conflicts.push(`Invalid ${type} payload or source.`);
      continue;
    }
    if (
      parsed.data.caseCode !== input.caseCode ||
      parsed.data.currency !== input.currency
    )
      conflicts.push(`Case or currency mismatch in ${type}.`);
    records.push(parsed.data);
    citations.push({
      evidenceId: String(group.latest.id),
      ruleId: null,
      note: `Verified snapshot record: ${type}. Source labels are synthetic, not authenticated external provenance.`,
    });
  }
  const quote = records.find(
    (r): r is Extract<FareEvidence, { type: "FARE_QUOTE" }> =>
      r.type === "FARE_QUOTE",
  );
  const receipt = records.find(
    (r): r is Extract<FareEvidence, { type: "FARE_RECEIPT" }> =>
      r.type === "FARE_RECEIPT",
  );
  const audit = records.find(
    (r): r is Extract<FareEvidence, { type: "FARE_ADJUSTMENT_RECORD" }> =>
      r.type === "FARE_ADJUSTMENT_RECORD",
  );
  if (
    quote &&
    receipt &&
    (quote.quoteId !== receipt.quoteId ||
      Date.parse(quote.acceptedAt) > Date.parse(receipt.chargedAt) ||
      receipt.chargedCents !== input.chargedCents)
  )
    conflicts.push(
      "Quote, charge or acceptance timing contradicts the trip/receipt.",
    );
  if (audit && receipt) {
    if (
      audit.quoteId !== receipt.quoteId ||
      audit.receiptId !== receipt.receiptId ||
      Date.parse(audit.reviewedAt) < Date.parse(receipt.chargedAt)
    )
      conflicts.push("Pricing audit does not match the charged receipt.");
    if (!audit.complete || audit.verification !== "VERIFIED")
      missing.push("COMPLETE_VERIFIED_PRICING_AUDIT");
    const receiptIds = new Set(receipt.extras.map((e) => e.id));
    if (audit.extras.some((e) => !receiptIds.has(e.id)))
      conflicts.push("Audit refers to an unknown receipt extra.");
    if (receipt.extras.some((e) => !audit.extras.some((a) => a.id === e.id)))
      missing.push("EXPLICIT_AUTHORIZATION_FOR_EACH_EXTRA");
    if (
      audit.extras.some(
        (a) =>
          a.permittedCents >
          (receipt.extras.find((e) => e.id === a.id)?.amountCents ?? 0),
      )
    )
      conflicts.push("Permitted extra exceeds its charged line item.");
  }
  const state = conflicts.length
    ? "CONTRADICTORY_EVIDENCE"
    : missing.length
      ? "INSUFFICIENT_EVIDENCE"
      : "SUFFICIENT";
  const sufficiency: SufficiencyResult = {
    state,
    reasons: [
      ...conflicts,
      ...missing.map(
        (m) => `Required pricing evidence missing or unverified: ${m}.`,
      ),
      ...reasons,
    ],
    missingRequirements: missing,
  };
  if (state !== "SUFFICIENT" || !quote || !receipt || !audit)
    return { sufficiency, metrics: null, citations };
  const permittedExtrasCents = audit.extras.reduce(
    (sum, e) => sum + (e.permitted ? e.permittedCents : 0),
    0,
  );
  const allowedCents = quote.quotedCents + permittedExtrasCents;
  sufficiency.reasons = [
    "Both statements, accepted fixed quote, itemized charge and complete verified permitted-extras record are consistent.",
  ];
  return {
    sufficiency,
    metrics: {
      quotedCents: quote.quotedCents,
      permittedExtrasCents,
      allowedCents,
      chargedCents: receipt.chargedCents,
      excessCents: Math.max(0, receipt.chargedCents - allowedCents),
    },
    citations,
  };
}

export function evaluateFare(
  input: FareInput,
  policy: { code: string; version: number; rules: unknown },
): { sufficiency: SufficiencyResult; evaluation: EvaluationResult } {
  if (policy.code !== FARE_POLICY_CODE)
    throw new Error("category_policy_mismatch");
  const rules = farePolicyRulesSchema.parse(policy.rules);
  const assessment = assessFare(input),
    { sufficiency, metrics } = assessment;
  const rule = metrics
    ? rules.rules.find(
        (r) =>
          r.when.excessCharge ===
          (metrics.excessCents > 0 ? "POSITIVE" : "ZERO"),
      )
    : undefined;
  const outcome =
    sufficiency.state === "CONTRADICTORY_EVIDENCE"
      ? "INCONCLUSIVE"
      : sufficiency.state !== "SUFFICIENT"
        ? "INSUFFICIENT_EVIDENCE"
        : (rule?.then.outcome ?? rules.fallback.outcome);
  return {
    sufficiency,
    evaluation: {
      outcome,
      sufficiencyState: sufficiency.state,
      refundCents: rule?.then.refund === "EXCESS" ? metrics!.excessCents : 0,
      rationale: rule
        ? `${rule.description} — ${rule.then.note} Accepted ${metrics!.quotedCents} cents + permitted extras ${metrics!.permittedExtrasCents} cents = ${metrics!.allowedCents} cents; charged ${metrics!.chargedCents} cents; excess ${metrics!.excessCents} cents.`
        : sufficiency.state === "SUFFICIENT"
          ? rules.fallback.note
          : sufficiency.reasons.join(" "),
      citations: [
        ...assessment.citations,
        ...(rule
          ? [
              {
                evidenceId: "policy",
                ruleId: rule.id,
                note: `Matched ${rule.id}; amount computed from cited pricing records.`,
              },
            ]
          : []),
      ],
      policyCode: policy.code,
      policyVersion: policy.version,
      matchedRuleId: rule?.id ?? null,
      metrics: {
        driverLastPos: null,
        riderLastPos: null,
        driverDistanceToPickupM: null,
        riderDistanceToPickupM: null,
        waitSeconds: 0,
        designatedEntrance: null,
        driverActualLocation: null,
        driverDistanceToDesignatedEntranceM: null,
        ...(metrics ? { fare: metrics } : {}),
      },
    },
  };
}
