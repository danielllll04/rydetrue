/**
 * Evidence sufficiency checker.
 *
 * Runs BEFORE policy evaluation. Determines whether the available evidence
 * is sufficient to make a deterministic recommendation, or whether the
 * case should be escalated for human review.
 *
 * Key safety principle: weak GPS proximity alone can NEVER prove a party's
 * claim. An independent geotag (THIRD_PARTY_GEOTAG) is required for any
 * pickup-location determination.
 */

import { GpsPing, SufficiencyState } from "./schemas";
import { EvidenceGroup, extractGpsTrail } from "./evidence";
import { haversineMeters, LatLng } from "./geo";

export interface ThirdPartyGeotag {
  designatedEntrance: LatLng;
  driverActualLocation: LatLng;
  capturedAt: string;
  providerName: string;
}

export interface SufficiencyInput {
  hasRiderStatement: boolean;
  hasDriverStatement: boolean;
  hasTripTelemetry: boolean;
  riderGpsTrail: GpsPing[];
  driverGpsTrail: GpsPing[];
  thirdPartyGeotag: ThirdPartyGeotag | null;
}

export interface SufficiencyResult {
  state: SufficiencyState;
  reasons: string[];
  missingRequirements: string[];
}

/** Maximum GPS accuracy (in meters) to be considered "precise enough". */
export const GPS_ACCURACY_THRESHOLD_M = 50;

/** If GPS and geotag disagree by more than this, evidence is contradictory. */
export const CONTRADICTION_THRESHOLD_M = 100;

/**
 * Check whether evidence is sufficient for deterministic policy evaluation.
 *
 * Returns one of:
 *  - SUFFICIENT: enough evidence to evaluate deterministically
 *  - INSUFFICIENT_EVIDENCE: critical evidence is missing
 *  - CONTRADICTORY_EVIDENCE: evidence present but mutually inconsistent
 *  - ESCALATE_FOR_REVIEW: ambiguous, requires human judgment
 */
export function checkSufficiency(input: SufficiencyInput): SufficiencyResult {
  const reasons: string[] = [];
  const missing: string[] = [];

  // --- Required: statements from both parties ---
  if (!input.hasRiderStatement) {
    missing.push("RIDER_STATEMENT");
    reasons.push("Rider statement is missing.");
  }
  if (!input.hasDriverStatement) {
    missing.push("DRIVER_STATEMENT");
    reasons.push("Driver statement is missing.");
  }

  // --- Required: trip telemetry (for wait time) ---
  if (!input.hasTripTelemetry) {
    missing.push("TRIP_TELEMETRY");
    reasons.push("Trip telemetry (wait time) is missing.");
  }

  // --- Required: independent geotag for pickup-location disputes ---
  // GPS proximity alone is NEVER sufficient to prove a party's claim.
  if (!input.thirdPartyGeotag) {
    missing.push("THIRD_PARTY_GEOTAG");
    reasons.push(
      "No independent geotag confirming the designated entrance and " +
        "driver's actual location. GPS proximity alone cannot prove a claim."
    );
  }

  // --- Check GPS accuracy ---
  // Even with a geotag, we flag low-accuracy GPS as a reason (but it doesn't
  // block evaluation if the geotag is present).
  const riderAccuracy = worstAccuracy(input.riderGpsTrail);
  const driverAccuracy = worstAccuracy(input.driverGpsTrail);
  if (riderAccuracy !== null && riderAccuracy > GPS_ACCURACY_THRESHOLD_M) {
    reasons.push(
      `Rider GPS accuracy (${riderAccuracy}m) exceeds threshold (${GPS_ACCURACY_THRESHOLD_M}m); ` +
        "rider GPS will not be used as sole proof of pickup location."
    );
  }
  if (driverAccuracy !== null && driverAccuracy > GPS_ACCURACY_THRESHOLD_M) {
    reasons.push(
      `Driver GPS accuracy (${driverAccuracy}m) exceeds threshold (${GPS_ACCURACY_THRESHOLD_M}m); ` +
        "driver GPS will not be used as sole proof of pickup location."
    );
  }

  // --- Check for contradictory evidence ---
  // If both GPS and geotag exist, verify they don't contradict each other.
  if (input.thirdPartyGeotag && input.driverGpsTrail.length > 0) {
    const driverLastGps = input.driverGpsTrail[input.driverGpsTrail.length - 1];
    const gpsPos = { lat: driverLastGps.lat, lng: driverLastGps.lng };
    const geotagPos = input.thirdPartyGeotag.driverActualLocation;
    const discrepancy = haversineMeters(gpsPos, geotagPos);
    if (discrepancy > CONTRADICTION_THRESHOLD_M) {
      return {
        state: "CONTRADICTORY_EVIDENCE",
        reasons: [
          `Driver GPS last position and third-party geotag disagree by ${Math.round(discrepancy)}m ` +
            `(threshold: ${CONTRADICTION_THRESHOLD_M}m). Evidence is mutually inconsistent.`,
          ...reasons,
        ],
        missingRequirements: missing,
      };
    }
  }

  // --- Final determination ---
  if (missing.length > 0) {
    return {
      state: "INSUFFICIENT_EVIDENCE",
      reasons,
      missingRequirements: missing,
    };
  }

  return {
    state: "SUFFICIENT",
    reasons: [
      "All required evidence present: both statements, trip telemetry, and independent geotag.",
      ...reasons,
      ...(riderAccuracy !== null && riderAccuracy <= GPS_ACCURACY_THRESHOLD_M
        ? [`Rider GPS accuracy (${riderAccuracy}m) within threshold.`]
        : []),
      ...(driverAccuracy !== null && driverAccuracy <= GPS_ACCURACY_THRESHOLD_M
        ? [`Driver GPS accuracy (${driverAccuracy}m) within threshold.`]
        : []),
    ],
    missingRequirements: [],
  };
}

/** Extract the worst (highest) accuracy value from a GPS trail. */
function worstAccuracy(trail: GpsPing[]): number | null {
  if (trail.length === 0) return null;
  const accuracies = trail
    .map((p) => p.accuracyM)
    .filter((a): a is number => a !== undefined && a !== null);
  if (accuracies.length === 0) return null;
  return Math.max(...accuracies);
}

/** Extract THIRD_PARTY_GEOTAG from evidence groups (if present). */
export function extractGeotag(groups: EvidenceGroup[]): ThirdPartyGeotag | null {
  for (const g of groups) {
    if (g.type === "THIRD_PARTY_GEOTAG") {
      const p = g.latest.payload;
      if (p.type === "THIRD_PARTY_GEOTAG") {
        return {
          designatedEntrance: p.designatedEntrance,
          driverActualLocation: p.driverActualLocation,
          capturedAt: p.capturedAt,
          providerName: p.providerName,
        };
      }
    }
  }
  return null;
}

/** Extract GPS trails from evidence groups. */
export function trailsFromGroupsSufficiency(groups: EvidenceGroup[]): {
  riderGpsTrail: GpsPing[];
  driverGpsTrail: GpsPing[];
} {
  let riderGpsTrail: GpsPing[] = [];
  let driverGpsTrail: GpsPing[] = [];
  for (const g of groups) {
    if (g.refGroup === "rider-gps") {
      try {
        riderGpsTrail = extractGpsTrail(g);
      } catch {
        // not a GPS group
      }
    }
    if (g.refGroup === "driver-gps") {
      try {
        driverGpsTrail = extractGpsTrail(g);
      } catch {
        // not a GPS group
      }
    }
  }
  return { riderGpsTrail, driverGpsTrail };
}