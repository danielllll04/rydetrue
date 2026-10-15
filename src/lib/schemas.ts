import { z } from "zod";
import { fareQuoteSchema, fareReceiptSchema, fareAdjustmentSchema } from "./fare-contracts";

/** Lat/lng coordinates. */
export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** A single GPS ping inside a GPS trail. */
export const gpsPingSchema = z.object({
  at: z.string().datetime(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
  speedMps: z.number().nonnegative().optional(),
});

export type GpsPing = z.infer<typeof gpsPingSchema>;

/** Payload schemas per evidence type. */
export const evidencePayloadSchema = z.union([
  fareQuoteSchema,
  fareReceiptSchema,
  fareAdjustmentSchema,
  z.object({
    type: z.literal("GPS_PING"),
    trail: z.array(gpsPingSchema).min(1),
  }),
  z.object({
    type: z.literal("PHOTO_META"),
    capturedAt: z.string().datetime(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    exif: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal("CHAT_LOG"),
    messages: z.array(
      z.object({
        at: z.string().datetime(),
        from: z.enum(["RIDER", "DRIVER", "PLATFORM"]),
        text: z.string(),
      })
    ),
  }),
  z.object({
    type: z.literal("TRIP_TELEMETRY"),
    driverArrivedAt: z.string().datetime().optional(),
    pickupReachedAt: z.string().datetime().optional(),
    cancelledAt: z.string().datetime().optional(),
    waitSeconds: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("AUDIO_META"),
    durationSec: z.number().nonnegative(),
    capturedAt: z.string().datetime(),
  }),
  // Independently sourced geotag (e.g., airport ground-operations log,
  // CCTV cross-reference). Identifies the designated pickup entrance and the
  // driver's actual waiting location with authoritative coordinates.
  z.object({
    type: z.literal("THIRD_PARTY_GEOTAG"),
    providerName: z.string(),
    designatedEntrance: latLngSchema,
    driverActualLocation: latLngSchema,
    capturedAt: z.string().datetime(),
  }),
]);

export type EvidencePayload = z.infer<typeof evidencePayloadSchema>;

/** Outcome of evaluating a dispute. Extended to include sufficiency-derived outcomes. */
export const outcomeSchema = z.enum([
  "REFUND_FULL",
  "REFUND_PARTIAL",
  "NO_REFUND",
  "SPLIT",
  "INSUFFICIENT_EVIDENCE",
  "ESCALATE_FOR_REVIEW",
  "INCONCLUSIVE",
]);

export type Outcome = z.infer<typeof outcomeSchema>;

/** Evidence sufficiency state — checked BEFORE policy evaluation. */
export const sufficiencyStateSchema = z.enum([
  "SUFFICIENT",
  "INSUFFICIENT_EVIDENCE",
  "CONTRADICTORY_EVIDENCE",
  "ESCALATE_FOR_REVIEW",
]);

export type SufficiencyState = z.infer<typeof sufficiencyStateSchema>;

/** Case status values. */
export const caseStatusSchema = z.enum([
  "OPEN",
  "INVESTIGATING",
  "PENDING_REVIEW",
  "EVALUATED",
  "AWAITING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "REOPENED",
  "CLOSED",
]);

export type CaseStatus = z.infer<typeof caseStatusSchema>;

/** Recommendation approval state. */
export const approvalStateSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "NOT_APPLICABLE",
]);

export type ApprovalState = z.infer<typeof approvalStateSchema>;

/** Request body for POST /api/cases/[id]/evaluate. */
export const evaluateRequestSchema = z.object({
  policyCode: z.string().min(1),
  asOf: z.string().datetime().optional(),
  actor: z.string().default("system"),
});

export type EvaluateRequest = z.infer<typeof evaluateRequestSchema>;

/** Request body for POST /api/cases/[id]/evidence (submit new evidence). */
export const submitEvidenceRequestSchema = z.object({
  type: z.enum([
    "FARE_QUOTE",
    "FARE_RECEIPT",
    "FARE_ADJUSTMENT_RECORD",
    "GPS_PING",
    "PHOTO_META",
    "CHAT_LOG",
    "TRIP_TELEMETRY",
    "AUDIO_META",
    "THIRD_PARTY_GEOTAG",
  ]),
  source: z.enum(["RIDER_PHONE", "DRIVER_PHONE", "PLATFORM", "THIRD_PARTY"]),
  refGroup: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  capturedAt: z.string().datetime(),
  notes: z.string().optional(),
  actor: z.string().default("system"),
});

export type SubmitEvidenceRequest = z.infer<typeof submitEvidenceRequestSchema>;

/** Request body for POST /api/cases/[id]/recommendations/[recId]/approve. */
export const approveRequestSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  actor: z.string().min(1),
  notes: z.string().optional(),
});

export type ApproveRequest = z.infer<typeof approveRequestSchema>;

/** Request body for POST /api/cases/[id]/investigate. */
export const investigateRequestSchema = z.object({
  retryInvestigationId: z.string().min(1).max(100).optional(),
  policyCode: z.string().min(1),
  actor: z.string().default("system"),
});

export type InvestigateRequest = z.infer<typeof investigateRequestSchema>;
