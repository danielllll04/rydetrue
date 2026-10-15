import { z } from "zod";
import type {
  Dispute,
  Trip,
  Statement,
  Evidence,
  PolicyVersion,
} from "@prisma/client";
import { evidencePayloadSchema, outcomeSchema } from "./schemas";
import { groupLatestByRefGroup, verifyHash } from "./evidence";
import { evaluateFare, FARE_POLICY_CODE } from "./fare-policy";
import { evaluatePolicy, trailsFromGroups, type Policy } from "./policy";
import { checkSufficiency, extractGeotag } from "./sufficiency";

const cancellationAction = z
  .object({
    outcome: outcomeSchema,
    refundCents: z.number().int().nonnegative().optional(),
    note: z.string(),
  })
  .strict();
const cancellationRules = z
  .object({
    rules: z.array(
      z
        .object({
          id: z.string(),
          description: z.string(),
          when: z
            .object({
              driverWithinPickupM: z.number().nonnegative().optional(),
              riderWithinPickupM: z.number().nonnegative().optional(),
              driverFartherThanPickupM: z.number().nonnegative().optional(),
              minWaitSeconds: z.number().nonnegative().optional(),
              maxWaitSeconds: z.number().nonnegative().optional(),
              requiresThirdPartyGeotag: z.boolean().optional(),
              driverFartherThanDesignatedEntranceM: z
                .number()
                .nonnegative()
                .optional(),
              driverWithinDesignatedEntranceM: z
                .number()
                .nonnegative()
                .optional(),
            })
            .strict(),
          then: cancellationAction,
        })
        .strict(),
    ),
    fallback: cancellationAction,
  })
  .strict();

export function categoryPolicyCode(category: string): string {
  if (category === "FARE_DISCREPANCY") return FARE_POLICY_CODE;
  if (category === "CANCELLATION_FEE") return "CANCELLATION_FEE_SG";
  throw new Error("unsupported_category");
}
export type EvaluationCase = Dispute & {
  trip: Trip;
  statements: Statement[];
  evidence: Evidence[];
};

/** One category-bound deterministic path for evaluation, agents and human review. */
export function evaluateCategory(dispute: EvaluationCase, row: PolicyVersion) {
  if (row.code !== categoryPolicyCode(dispute.category))
    throw new Error("category_policy_mismatch");
  for (const record of dispute.evidence) {
    if (!verifyHash(record)) throw new Error("evidence_integrity_failed");
    const payload = evidencePayloadSchema.parse(JSON.parse(record.payload));
    if (payload.type !== record.type) throw new Error("evidence_type_mismatch");
  }
  const groups = groupLatestByRefGroup(dispute.evidence);
  const hasRiderStatement = dispute.statements.some((s) => s.role === "RIDER");
  const hasDriverStatement = dispute.statements.some(
    (s) => s.role === "DRIVER",
  );
  const rawRules: unknown = JSON.parse(row.rules);
  if (dispute.category === "FARE_DISCREPANCY") {
    const result = evaluateFare(
      {
        caseCode: dispute.caseCode,
        currency: dispute.trip.currency,
        tripStatus: dispute.trip.status,
        chargedCents: dispute.trip.fareAmountCents,
        hasRiderStatement,
        hasDriverStatement,
        groups,
      },
      { code: row.code, version: row.version, rules: rawRules },
    );
    return {
      ...result,
      policy: {
        code: row.code,
        version: row.version,
        description: row.description,
        ...z
          .object({ rules: z.unknown(), fallback: z.unknown() })
          .parse(rawRules),
      },
    };
  }
  const parsed = cancellationRules.parse(rawRules);
  const policy: Policy = {
    code: row.code,
    version: row.version,
    description: row.description,
    ...parsed,
  };
  const { riderGpsTrail, driverGpsTrail } = trailsFromGroups(groups);
  const thirdPartyGeotag = extractGeotag(groups);
  const hasTripTelemetry = groups.some((g) => g.type === "TRIP_TELEMETRY");
  const telemetry = groups.find((g) => g.type === "TRIP_TELEMETRY")?.latest
    .payload;
  const waitSeconds =
    telemetry?.type === "TRIP_TELEMETRY" ? (telemetry.waitSeconds ?? 0) : 0;
  const sufficiency = checkSufficiency({
    hasRiderStatement,
    hasDriverStatement,
    hasTripTelemetry,
    riderGpsTrail,
    driverGpsTrail,
    thirdPartyGeotag,
  });
  const evaluation = evaluatePolicy(
    {
      pickup: { lat: dispute.trip.pickupLat, lng: dispute.trip.pickupLng },
      riderGpsTrail,
      driverGpsTrail,
      thirdPartyGeotag,
      fareCents: dispute.trip.fareAmountCents,
      cancellationFeeCents: dispute.trip.cancellationFeeCents ?? 0,
      waitSeconds,
      hasRiderStatement,
      hasDriverStatement,
      hasTripTelemetry,
      evidenceById: new Map(),
    },
    policy,
    sufficiency.state,
  );
  return { policy, sufficiency, evaluation };
}
