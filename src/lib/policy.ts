/**
 * Deterministic policy evaluation.
 *
 * The evaluator is gated by the sufficiency checker: if evidence is not
 * SUFFICIENT, the evaluator returns INCONCLUSIVE with the sufficiency state
 * rather than applying any policy rule.
 *
 * Safety principle: GPS proximity alone can NEVER prove a party's claim.
 * The THIRD_PARTY_GEOTAG (independently sourced) is the authoritative
 * source for pickup-location determinations.
 */

import { GpsPing, Outcome, SufficiencyState } from "./schemas";
import { EvidenceGroup, extractGpsTrail, lastGpsPing } from "./evidence";
import { haversineMeters, LatLng } from "./geo";
import { ThirdPartyGeotag } from "./sufficiency";

export interface PolicyRule {
  id: string;
  description: string;
  when: PolicyCondition;
  then: {
    outcome: Outcome;
    refundCents?: number;
    note: string;
  };
}

export interface PolicyCondition {
  /** All listed conditions must be true (AND). */
  driverWithinPickupM?: number;
  riderWithinPickupM?: number;
  driverFartherThanPickupM?: number;
  minWaitSeconds?: number;
  maxWaitSeconds?: number;
  // Independent geotag conditions (authoritative for pickup-location disputes)
  requiresThirdPartyGeotag?: boolean;
  driverFartherThanDesignatedEntranceM?: number;
  driverWithinDesignatedEntranceM?: number;
}

export interface Policy {
  code: string;
  version: number;
  description: string;
  rules: PolicyRule[];
  fallback: { outcome: Outcome; refundCents?: number; note: string };
}

export interface EvaluationContext {
  pickup: LatLng;
  riderGpsTrail: GpsPing[];
  driverGpsTrail: GpsPing[];
  thirdPartyGeotag: ThirdPartyGeotag | null;
  fareCents: number;
  cancellationFeeCents: number;
  waitSeconds: number;
  hasRiderStatement: boolean;
  hasDriverStatement: boolean;
  hasTripTelemetry: boolean;
  evidenceById: Map<string, EvidenceGroup>;
}

export interface Citation {
  evidenceId: string;
  ruleId: string | null;
  note: string;
}

export interface EvaluationMetrics {
  driverLastPos: LatLng | null;
  riderLastPos: LatLng | null;
  driverDistanceToPickupM: number | null;
  riderDistanceToPickupM: number | null;
  waitSeconds: number;
  designatedEntrance: LatLng | null;
  driverActualLocation: LatLng | null;
  driverDistanceToDesignatedEntranceM: number | null;
}

export interface EvaluationResult {
  outcome: Outcome;
  sufficiencyState: SufficiencyState;
  refundCents: number;
  rationale: string;
  citations: Citation[];
  policyCode: string;
  policyVersion: number;
  matchedRuleId: string | null;
  metrics: EvaluationMetrics;
}

function evaluateCondition(
  cond: PolicyCondition,
  ctx: EvaluationContext,
  metrics: EvaluationMetrics
): boolean {
  if (cond.requiresThirdPartyGeotag && ctx.thirdPartyGeotag === null) {
    return false;
  }
  if (cond.driverFartherThanDesignatedEntranceM !== undefined) {
    if (ctx.thirdPartyGeotag === null) return false;
    if (
      metrics.driverDistanceToDesignatedEntranceM === null ||
      metrics.driverDistanceToDesignatedEntranceM <= cond.driverFartherThanDesignatedEntranceM
    )
      return false;
  }
  if (cond.driverWithinDesignatedEntranceM !== undefined) {
    if (ctx.thirdPartyGeotag === null) return false;
    if (
      metrics.driverDistanceToDesignatedEntranceM === null ||
      metrics.driverDistanceToDesignatedEntranceM > cond.driverWithinDesignatedEntranceM
    )
      return false;
  }
  if (cond.driverWithinPickupM !== undefined) {
    if (metrics.driverLastPos === null) return false;
    if (
      metrics.driverDistanceToPickupM === null ||
      metrics.driverDistanceToPickupM > cond.driverWithinPickupM
    )
      return false;
  }
  if (cond.riderWithinPickupM !== undefined) {
    if (metrics.riderLastPos === null) return false;
    if (
      metrics.riderDistanceToPickupM === null ||
      metrics.riderDistanceToPickupM > cond.riderWithinPickupM
    )
      return false;
  }
  if (cond.driverFartherThanPickupM !== undefined) {
    if (metrics.driverLastPos === null) return false;
    if (
      metrics.driverDistanceToPickupM === null ||
      metrics.driverDistanceToPickupM <= cond.driverFartherThanPickupM
    )
      return false;
  }
  if (cond.minWaitSeconds !== undefined) {
    if (ctx.waitSeconds < cond.minWaitSeconds) return false;
  }
  if (cond.maxWaitSeconds !== undefined) {
    if (ctx.waitSeconds > cond.maxWaitSeconds) return false;
  }
  return true;
}

/** Compute metrics up-front. Pure, no side effects. */
function computeMetrics(ctx: EvaluationContext): EvaluationMetrics {
  let driverLast: LatLng | null = null;
  let riderLast: LatLng | null = null;
  let driverDistance: number | null = null;
  let riderDistance: number | null = null;

  if (ctx.driverGpsTrail.length > 0) {
    const p = lastGpsPing(ctx.driverGpsTrail);
    driverLast = { lat: p.lat, lng: p.lng };
    driverDistance = haversineMeters(driverLast, ctx.pickup);
  }
  if (ctx.riderGpsTrail.length > 0) {
    const p = lastGpsPing(ctx.riderGpsTrail);
    riderLast = { lat: p.lat, lng: p.lng };
    riderDistance = haversineMeters(riderLast, ctx.pickup);
  }

  let designatedEntrance: LatLng | null = null;
  let driverActualLocation: LatLng | null = null;
  let driverDistanceToDesignatedEntrance: number | null = null;

  if (ctx.thirdPartyGeotag) {
    designatedEntrance = ctx.thirdPartyGeotag.designatedEntrance;
    driverActualLocation = ctx.thirdPartyGeotag.driverActualLocation;
    driverDistanceToDesignatedEntrance = haversineMeters(
      designatedEntrance,
      driverActualLocation
    );
  }

  return {
    driverLastPos: driverLast,
    riderLastPos: riderLast,
    driverDistanceToPickupM: driverDistance === null ? null : Math.round(driverDistance),
    riderDistanceToPickupM: riderDistance === null ? null : Math.round(riderDistance),
    waitSeconds: ctx.waitSeconds,
    designatedEntrance,
    driverActualLocation,
    driverDistanceToDesignatedEntranceM:
      driverDistanceToDesignatedEntrance === null
        ? null
        : Math.round(driverDistanceToDesignatedEntrance),
  };
}

/** Build base citations for transparency. */
function buildBaseCitations(
  ctx: EvaluationContext,
  metrics: EvaluationMetrics
): Citation[] {
  const cits: Citation[] = [];
  if (ctx.driverGpsTrail.length > 0) {
    cits.push({
      evidenceId: "driver-gps",
      ruleId: null,
      note: `Driver GPS trail: ${ctx.driverGpsTrail.length} pings; last at ${
        metrics.driverLastPos?.lat.toFixed(5)
      }, ${metrics.driverLastPos?.lng.toFixed(5)}; ${metrics.driverDistanceToPickupM}m from pickup pin.`,
    });
  }
  if (ctx.riderGpsTrail.length > 0) {
    cits.push({
      evidenceId: "rider-gps",
      ruleId: null,
      note: `Rider GPS trail: ${ctx.riderGpsTrail.length} pings; last at ${
        metrics.riderLastPos?.lat.toFixed(5)
      }, ${metrics.riderLastPos?.lng.toFixed(5)}; ${metrics.riderDistanceToPickupM}m from pickup pin.`,
    });
  }
  if (ctx.thirdPartyGeotag) {
    cits.push({
      evidenceId: "third-party-geotag",
      ruleId: null,
      note: `Independent geotag from ${ctx.thirdPartyGeotag.providerName}: ` +
        `designated entrance at ${metrics.designatedEntrance?.lat.toFixed(5)}, ${
          metrics.designatedEntrance?.lng.toFixed(5)
        }; driver actual location at ${metrics.driverActualLocation?.lat.toFixed(5)}, ${
          metrics.driverActualLocation?.lng.toFixed(5)
        }; ${metrics.driverDistanceToDesignatedEntranceM}m apart.`,
    });
  }
  cits.push({
    evidenceId: "trip",
    ruleId: null,
    note: `Trip fare ${ctx.fareCents} cents; cancellation fee charged ${ctx.cancellationFeeCents} cents; wait time ${ctx.waitSeconds}s.`,
  });
  return cits;
}

/**
 * Evaluate a context against a policy. Pure function, no I/O.
 *
 * If sufficiencyState is not SUFFICIENT, returns INCONCLUSIVE with the
 * sufficiency state — no policy rule is applied.
 */
export function evaluatePolicy(
  ctx: EvaluationContext,
  policy: Policy,
  sufficiencyState: SufficiencyState
): EvaluationResult {
  const metrics = computeMetrics(ctx);
  const baseCitations = buildBaseCitations(ctx, metrics);

  // --- Sufficiency gate ---
  // If evidence is insufficient, contradictory, or needs escalation,
  // do NOT apply any policy rule. Return a neutral outcome.
  if (sufficiencyState !== "SUFFICIENT") {
    const outcomeMap: Record<SufficiencyState, Outcome> = {
      SUFFICIENT: "INCONCLUSIVE", // unreachable but TS needs this
      INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
      CONTRADICTORY_EVIDENCE: "INCONCLUSIVE",
      ESCALATE_FOR_REVIEW: "ESCALATE_FOR_REVIEW",
    };
    return {
      outcome: outcomeMap[sufficiencyState],
      sufficiencyState,
      refundCents: 0,
      rationale:
        `Evidence is ${sufficiencyState}. ` +
        "No policy rule applied. Case requires additional evidence or human review. " +
        "No conclusion is drawn about either party's claim.",
      citations: baseCitations,
      policyCode: policy.code,
      policyVersion: policy.version,
      matchedRuleId: null,
      metrics,
    };
  }

  // --- Rule matching ---
  for (const rule of policy.rules) {
    if (evaluateCondition(rule.when, ctx, metrics)) {
      const refund =
        rule.then.refundCents ??
        (rule.then.outcome === "REFUND_FULL" ? ctx.cancellationFeeCents : 0);
      return {
        outcome: rule.then.outcome,
        sufficiencyState: "SUFFICIENT",
        refundCents: refund,
        rationale: `${rule.description} — ${rule.then.note}`,
        citations: [
          ...baseCitations,
          { evidenceId: "policy", ruleId: rule.id, note: `Matched rule ${rule.id}` },
        ],
        policyCode: policy.code,
        policyVersion: policy.version,
        matchedRuleId: rule.id,
        metrics,
      };
    }
  }

  // --- Fallback ---
  const refund =
    policy.fallback.refundCents ??
    (policy.fallback.outcome === "REFUND_FULL" ? ctx.cancellationFeeCents : 0);
  return {
    outcome: policy.fallback.outcome,
    sufficiencyState: "SUFFICIENT",
    refundCents: refund,
    rationale: `No rule matched. Fallback: ${policy.fallback.note}`,
    citations: [...baseCitations, { evidenceId: "policy", ruleId: null, note: "Fallback applied" }],
    policyCode: policy.code,
    policyVersion: policy.version,
    matchedRuleId: null,
    metrics,
  };
}

/** Convenience: pull GPS trails from grouped evidence. */
export function trailsFromGroups(groups: EvidenceGroup[]): {
  driverGpsTrail: GpsPing[];
  riderGpsTrail: GpsPing[];
} {
  let driverGpsTrail: GpsPing[] = [];
  let riderGpsTrail: GpsPing[] = [];
  for (const g of groups) {
    if (g.refGroup === "driver-gps") {
      try {
        driverGpsTrail = extractGpsTrail(g);
      } catch {
        // not a GPS group
      }
    }
    if (g.refGroup === "rider-gps") {
      try {
        riderGpsTrail = extractGpsTrail(g);
      } catch {
        // not a GPS group
      }
    }
  }
  return { driverGpsTrail, riderGpsTrail };
}