/**
 * Synthetic case fixtures for RydeTRUE.
 *
 * All data is fictional. Locations use real Singapore addresses (Changi
 * Airport) but the riders, drivers, trips, disputes, and policies are
 * invented for demonstration.
 *
 * RT-001 is a two-stage cancellation-fee dispute at Changi Airport T3:
 *
 * STAGE 1 (Initial Investigation):
 *   - Rider and driver provide conflicting statements.
 *   - GPS data is present but vague (accuracy 80m) — insufficient to
 *     pinpoint the exact pickup entrance.
 *   - No independent geotag.
 *   - Sufficiency check returns INSUFFICIENT_EVIDENCE.
 *   - System does NOT conclude either party is dishonest.
 *
 * STAGE 2 (New Evidence):
 *   - A THIRD_PARTY_GEOTAG (airport ground-operations log) identifies the
 *     designated entrance and the driver's actual waiting location.
 *   - The geotag shows a pickup-location mismatch (~100m apart).
 *   - Sufficiency check returns SUFFICIENT.
 *   - Policy evaluation recommends REFUND_FULL for SGD 5.00.
 *   - Previous recommendation and evidence versions are preserved.
 */

import type { GpsPing } from "./schemas";

export const RT_001_CASE_CODE = "RT-001";

// ---------------------------------------------------------------------------
// Changi Airport Terminal 3, Singapore.
// Pickup pin is at the designated Arrival Hall Door 1.
// The driver actually waited at Door 2 (~100m away).
// ---------------------------------------------------------------------------

export const RT_001_PICKUP = { lat: 1.35457, lng: 103.98725 } as const;

export const RT_001_DESIGNATED_ENTRANCE = { lat: 1.35457, lng: 103.98725 } as const;
export const RT_001_DRIVER_ACTUAL_LOCATION = { lat: 1.35400, lng: 103.98650 } as const;

export const RT_001_DROPOFF = {
  label: "Changi Airport T3 Departure Drop-off",
  lat: 1.35535,
  lng: 103.98705,
} as const;

const BASE_TIME = "2026-10-12T14:30:00.000Z";
const isoMinus = (sec: number) =>
  new Date(new Date(BASE_TIME).getTime() - sec * 1000).toISOString();
const isoPlus = (sec: number) =>
  new Date(new Date(BASE_TIME).getTime() + sec * 1000).toISOString();

// ---------------------------------------------------------------------------
// STAGE 1 — Initial Investigation evidence
// ---------------------------------------------------------------------------

/**
 * Rider statement (Stage 1).
 * Rider claims the driver never arrived at the designated pickup entrance.
 */
export const RT_001_RIDER_STATEMENT = {
  role: "RIDER" as const,
  authorAlias: "Rider A.",
  text:
    "I was waiting at the designated pickup entrance (Door 1, Changi Airport " +
    "T3 Arrival Hall) as shown in the app. The driver never showed up at that " +
    "entrance. After waiting, I received a cancellation fee of SGD 5.00. I did " +
    "not cancel the ride. Please refund the cancellation fee.",
};

/**
 * Driver statement (Stage 1).
 * Driver claims they arrived and waited at the pickup.
 */
export const RT_001_DRIVER_STATEMENT = {
  role: "DRIVER" as const,
  authorAlias: "Driver B.",
  text:
    "I arrived at the pickup location and waited for the rider. I was at the " +
    "arrival hall entrance as shown in my GPS. The rider never appeared. " +
    "After waiting, I cancelled the trip. The cancellation fee is justified.",
};

/**
 * Rider GPS trail (Stage 1) — vague, single ping with 80m accuracy.
 * Insufficient to pinpoint the exact entrance.
 */
export const RT_001_STAGE_1_RIDER_GPS: GpsPing[] = [
  { at: isoPlus(0), lat: 1.35460, lng: 103.98720, accuracyM: 80 },
];

/**
 * Driver GPS trail (Stage 1) — vague, single ping with 80m accuracy.
 * Insufficient to pinpoint the exact entrance.
 */
export const RT_001_STAGE_1_DRIVER_GPS: GpsPing[] = [
  { at: isoPlus(70), lat: 1.35410, lng: 103.98660, accuracyM: 80 },
];

/**
 * Chat log between rider and driver (Stage 1).
 */
export const RT_001_CHAT_LOG = {
  type: "CHAT_LOG" as const,
  messages: [
    {
      at: isoPlus(0),
      from: "RIDER" as const,
      text: "I'm at Door 1, Arrival Hall. Where are you?",
    },
    {
      at: isoPlus(60),
      from: "DRIVER" as const,
      text: "I'm at the arrival hall entrance. I don't see you.",
    },
    {
      at: isoPlus(120),
      from: "RIDER" as const,
      text: "I'm at Door 1! Are you at a different entrance?",
    },
    {
      at: isoPlus(180),
      from: "DRIVER" as const,
      text: "I've been waiting. Cancelling — rider no-show.",
    },
    {
      at: isoPlus(180),
      from: "PLATFORM" as const,
      text: "Cancellation fee of SGD 5.00 charged to rider.",
    },
  ],
};

/**
 * Trip telemetry (Stage 1).
 */
export const RT_001_TRIP_TELEMETRY = {
  type: "TRIP_TELEMETRY" as const,
  driverArrivedAt: isoPlus(70),
  pickupReachedAt: undefined,
  cancelledAt: isoPlus(180),
  waitSeconds: 180,
};

// ---------------------------------------------------------------------------
// STAGE 2 — New Evidence
// ---------------------------------------------------------------------------

/**
 * Stage 2 new evidence: independently sourced THIRD_PARTY_GEOTAG.
 * Source: Changi Airport Ground Operations Log (fictional).
 * Identifies:
 *   - designatedEntrance: Door 1 (where rider was waiting)
 *   - driverActualLocation: Door 2 (where driver actually waited)
 * The ~100m gap confirms a pickup-location mismatch.
 */
export const RT_001_STAGE_2_GEOTAG = {
  type: "THIRD_PARTY_GEOTAG" as const,
  source: "THIRD_PARTY" as const,
  refGroup: "third-party-geotag" as const,
  capturedAt: isoPlus(200),
  payload: {
    type: "THIRD_PARTY_GEOTAG" as const,
    providerName: "Changi Airport Ground Operations Log",
    designatedEntrance: {
      lat: RT_001_DESIGNATED_ENTRANCE.lat,
      lng: RT_001_DESIGNATED_ENTRANCE.lng,
    },
    driverActualLocation: {
      lat: RT_001_DRIVER_ACTUAL_LOCATION.lat,
      lng: RT_001_DRIVER_ACTUAL_LOCATION.lng,
    },
    capturedAt: isoPlus(200),
  },
};

// ---------------------------------------------------------------------------
// Stage 1 evidence grouped (for seed and tests)
// ---------------------------------------------------------------------------

export const RT_001_STAGE_1_EVIDENCE_BY_GROUP = {
  "rider-gps": {
    type: "GPS_PING" as const,
    source: "RIDER_PHONE" as const,
    refGroup: "rider-gps",
    capturedAt: isoPlus(0),
    payload: { type: "GPS_PING" as const, trail: RT_001_STAGE_1_RIDER_GPS },
  },
  "driver-gps": {
    type: "GPS_PING" as const,
    source: "DRIVER_PHONE" as const,
    refGroup: "driver-gps",
    capturedAt: isoPlus(70),
    payload: { type: "GPS_PING" as const, trail: RT_001_STAGE_1_DRIVER_GPS },
  },
  "trip-chat": {
    type: "CHAT_LOG" as const,
    source: "PLATFORM" as const,
    refGroup: "trip-chat",
    capturedAt: isoPlus(180),
    payload: RT_001_CHAT_LOG,
  },
  "trip-telemetry": {
    type: "TRIP_TELEMETRY" as const,
    source: "PLATFORM" as const,
    refGroup: "trip-telemetry",
    capturedAt: isoPlus(180),
    payload: RT_001_TRIP_TELEMETRY,
  },
} as const;

// ---------------------------------------------------------------------------
// Backward-compat alias: full evidence set (Stage 1 + Stage 2 combined).
// Used by evidence.test.ts for generic hash/versioning tests.
// ---------------------------------------------------------------------------

export const RT_001_EVIDENCE_BY_GROUP = {
  ...RT_001_STAGE_1_EVIDENCE_BY_GROUP,
  "third-party-geotag": RT_001_STAGE_2_GEOTAG,
} as const;

// ---------------------------------------------------------------------------
// Backward-compat aliases for geo/policy tests that reference GPS trails.
// These are the Stage 1 vague trails.
// ---------------------------------------------------------------------------

export const RT_001_RIDER_TRAIL = RT_001_STAGE_1_RIDER_GPS;
export const RT_001_DRIVER_TRAIL = RT_001_STAGE_1_DRIVER_GPS;

// ---------------------------------------------------------------------------
// Policy versions
// ---------------------------------------------------------------------------

/**
 * Synthetic Singapore cancellation-fee policy v2 (effective 2026-07-01).
 *
 * SAFETY: requires THIRD_PARTY_GEOTAG for any pickup-location determination.
 * GPS proximity alone can NEVER trigger a refund.
 */
export const RT_001_POLICY = {
  code: "CANCELLATION_FEE_SG",
  version: 2,
  description:
    "Singapore cancellation-fee policy v2 (effective 2026-07-01). " +
    "Requires independent geotag for pickup-location disputes. " +
    "GPS proximity alone is insufficient to prove any party's claim.",
  rules: [
    {
      id: "SG-CXL-R1",
      description: "Independent geotag confirms driver at wrong entrance.",
      when: {
        requiresThirdPartyGeotag: true,
        driverFartherThanDesignatedEntranceM: 30,
      },
      then: {
        outcome: "REFUND_FULL" as const,
        refundCents: 500, // full refund of SGD 5.00 cancellation fee
        note: "Independent geotag confirms driver waited at a different entrance " +
          "than the designated pickup. Cancellation fee refunded in full.",
      },
    },
    {
      id: "SG-CXL-R2",
      description: "Independent geotag confirms driver at designated entrance and waited.",
      when: {
        requiresThirdPartyGeotag: true,
        driverWithinDesignatedEntranceM: 30,
        minWaitSeconds: 120,
      },
      then: {
        outcome: "NO_REFUND" as const,
        refundCents: 0,
        note: "Independent geotag confirms driver was at the designated entrance " +
          "and waited at least 120 seconds. Cancellation fee retained.",
      },
    },
  ],
  fallback: {
    outcome: "ESCALATE_FOR_REVIEW" as const,
    refundCents: 0,
    note: "Evidence is sufficient but no rule clearly matches. " +
      "Escalate for human review. Do not automatically charge or refund.",
  },
};

/** Earlier policy version (deprecated) for testing policy-versioning behaviour. */
export const RT_001_POLICY_V1 = {
  code: "CANCELLATION_FEE_SG",
  version: 1,
  description:
    "Singapore cancellation-fee policy v1 (effective 2026-01-01 through 2026-06-30). " +
    "Legacy rule set — did not require independent geotag.",
  rules: [
    {
      id: "SG-CXL-R1-LEGACY",
      description: "Legacy: driver arrived at pickup and waited minimum time.",
      when: {
        driverWithinPickupM: 50,
        minWaitSeconds: 90,
      },
      then: {
        outcome: "NO_REFUND" as const,
        refundCents: 0,
        note: "Legacy rule: driver was within 50m and waited >= 90s. Fee retained.",
      },
    },
  ],
  fallback: {
    outcome: "NO_REFUND" as const,
    refundCents: 0,
    note: "Legacy fallback: fee retained unless explicit override.",
  },
};

// ---------------------------------------------------------------------------
// Synthetic trip + dispute metadata for RT-001
// ---------------------------------------------------------------------------

export const RT_001_TRIP = {
  caseCode: RT_001_CASE_CODE,
  city: "Singapore",
  status: "CANCELLED_BY_DRIVER",
  requestedAt: isoMinus(30),
  acceptedAt: isoPlus(0),
  cancelledAt: isoPlus(180),
  pickupLabel: "Changi Airport T3 Arrival Hall — Door 1 (Pickup Pin)",
  pickupLat: RT_001_PICKUP.lat,
  pickupLng: RT_001_PICKUP.lng,
  dropoffLabel: RT_001_DROPOFF.label,
  dropoffLat: RT_001_DROPOFF.lat,
  dropoffLng: RT_001_DROPOFF.lng,
  fareAmountCents: 1850, // SGD 18.50 estimated fare to city
  currency: "SGD",
  cancellationFeeCents: 500, // SGD 5.00 cancellation fee charged
};

export const RT_001_DISPUTE = {
  caseCode: RT_001_CASE_CODE,
  category: "CANCELLATION_FEE",
  status: "OPEN" as const,
  summary:
    "Rider disputes a SGD 5.00 cancellation fee at Changi Airport T3, " +
    "alleging the driver never arrived at the designated pickup entrance. " +
    "Driver claims they arrived and waited.",
};