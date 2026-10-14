import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  latLngSchema,
  gpsPingSchema,
  evidencePayloadSchema,
  outcomeSchema,
  evaluateRequestSchema,
  sufficiencyStateSchema,
  caseStatusSchema,
  approvalStateSchema,
  submitEvidenceRequestSchema,
  approveRequestSchema,
} from "../src/lib/schemas";

describe("schemas.latLngSchema", () => {
  it("accepts valid coordinates", () => {
    expect(() => latLngSchema.parse({ lat: 1.35457, lng: 103.98725 })).not.toThrow();
  });
  it("rejects out-of-range lat", () => {
    expect(() => latLngSchema.parse({ lat: 91, lng: 0 })).toThrow();
  });
  it("rejects out-of-range lng", () => {
    expect(() => latLngSchema.parse({ lat: 0, lng: 181 })).toThrow();
  });
});

describe("schemas.gpsPingSchema", () => {
  it("accepts a minimal ping", () => {
    expect(() =>
      gpsPingSchema.parse({
        at: "2026-10-12T14:32:00.000Z",
        lat: 1.35,
        lng: 103.98,
      })
    ).not.toThrow();
  });
  it("rejects non-ISO datetime", () => {
    expect(() =>
      gpsPingSchema.parse({
        at: "yesterday",
        lat: 1.35,
        lng: 103.98,
      })
    ).toThrow();
  });
});

describe("schemas.evidencePayloadSchema", () => {
  it("accepts a GPS_PING payload", () => {
    expect(() =>
      evidencePayloadSchema.parse({
        type: "GPS_PING",
        trail: [{ at: "2026-10-12T14:32:00.000Z", lat: 1.35, lng: 103.98 }],
      })
    ).not.toThrow();
  });
  it("accepts a CHAT_LOG payload", () => {
    expect(() =>
      evidencePayloadSchema.parse({
        type: "CHAT_LOG",
        messages: [
          { at: "2026-10-12T14:32:00.000Z", from: "RIDER", text: "hi" },
        ],
      })
    ).not.toThrow();
  });
  it("accepts a THIRD_PARTY_GEOTAG payload", () => {
    expect(() =>
      evidencePayloadSchema.parse({
        type: "THIRD_PARTY_GEOTAG",
        providerName: "Changi Airport Ground Operations Log",
        designatedEntrance: { lat: 1.35457, lng: 103.98725 },
        driverActualLocation: { lat: 1.35400, lng: 103.98650 },
        capturedAt: "2026-10-12T14:33:20.000Z",
      })
    ).not.toThrow();
  });
  it("rejects a THIRD_PARTY_GEOTAG payload with invalid coordinates", () => {
    expect(() =>
      evidencePayloadSchema.parse({
        type: "THIRD_PARTY_GEOTAG",
        providerName: "test",
        designatedEntrance: { lat: 999, lng: 103.98725 },
        driverActualLocation: { lat: 1.35400, lng: 103.98650 },
        capturedAt: "2026-10-12T14:33:20.000Z",
      })
    ).toThrow();
  });
  it("rejects an unknown type", () => {
    expect(() =>
      evidencePayloadSchema.parse({ type: "UNKNOWN", data: {} })
    ).toThrow();
  });
});

describe("schemas.outcomeSchema", () => {
  it("accepts all seven outcomes including sufficiency-derived ones", () => {
    for (const o of [
      "REFUND_FULL",
      "REFUND_PARTIAL",
      "NO_REFUND",
      "SPLIT",
      "INSUFFICIENT_EVIDENCE",
      "ESCALATE_FOR_REVIEW",
      "INCONCLUSIVE",
    ]) {
      expect(() => outcomeSchema.parse(o)).not.toThrow();
    }
  });
  it("rejects an unknown outcome", () => {
    expect(() => outcomeSchema.parse("GIVE_ME_MONEY")).toThrow();
  });
});

describe("schemas.sufficiencyStateSchema", () => {
  it("accepts all four states", () => {
    for (const s of ["SUFFICIENT", "INSUFFICIENT_EVIDENCE", "CONTRADICTORY_EVIDENCE", "ESCALATE_FOR_REVIEW"]) {
      expect(() => sufficiencyStateSchema.parse(s)).not.toThrow();
    }
  });
});

describe("schemas.caseStatusSchema", () => {
  it("accepts all status values", () => {
    for (const s of [
      "OPEN", "INVESTIGATING", "PENDING_REVIEW", "EVALUATED",
      "AWAITING_APPROVAL", "APPROVED", "REJECTED", "REOPENED", "CLOSED",
    ]) {
      expect(() => caseStatusSchema.parse(s)).not.toThrow();
    }
  });
});

describe("schemas.approvalStateSchema", () => {
  it("accepts all approval states", () => {
    for (const s of ["PENDING", "APPROVED", "REJECTED", "NOT_APPLICABLE"]) {
      expect(() => approvalStateSchema.parse(s)).not.toThrow();
    }
  });
});

describe("schemas.evaluateRequestSchema", () => {
  it("applies default actor", () => {
    const r = evaluateRequestSchema.parse({ policyCode: "X" });
    expect(r.actor).toBe("system");
  });
  it("requires policyCode", () => {
    expect(() => evaluateRequestSchema.parse({})).toThrow();
  });
  it("rejects empty policyCode", () => {
    expect(() => evaluateRequestSchema.parse({ policyCode: "" })).toThrow(z.ZodError);
  });
});

describe("schemas.submitEvidenceRequestSchema", () => {
  it("accepts a valid evidence submission", () => {
    expect(() =>
      submitEvidenceRequestSchema.parse({
        type: "THIRD_PARTY_GEOTAG",
        source: "THIRD_PARTY",
        refGroup: "third-party-geotag",
        payload: {
          type: "THIRD_PARTY_GEOTAG",
          providerName: "test",
          designatedEntrance: { lat: 1.35, lng: 103.98 },
          driverActualLocation: { lat: 1.35, lng: 103.98 },
          capturedAt: "2026-10-12T14:33:20.000Z",
        },
        capturedAt: "2026-10-12T14:33:20.000Z",
      })
    ).not.toThrow();
  });
  it("applies default actor", () => {
    const r = submitEvidenceRequestSchema.parse({
      type: "GPS_PING",
      source: "RIDER_PHONE",
      refGroup: "rider-gps",
      payload: { type: "GPS_PING", trail: [{ at: "2026-10-12T14:32:00.000Z", lat: 1.35, lng: 103.98 }] },
      capturedAt: "2026-10-12T14:32:00.000Z",
    });
    expect(r.actor).toBe("system");
  });
  it("rejects an unknown evidence type", () => {
    expect(() =>
      submitEvidenceRequestSchema.parse({
        type: "UNKNOWN",
        source: "RIDER_PHONE",
        refGroup: "test",
        payload: {},
        capturedAt: "2026-10-12T14:32:00.000Z",
      })
    ).toThrow();
  });
});

describe("schemas.approveRequestSchema", () => {
  it("accepts APPROVED with actor", () => {
    expect(() =>
      approveRequestSchema.parse({ decision: "APPROVED", actor: "reviewer:1" })
    ).not.toThrow();
  });
  it("accepts REJECTED with actor", () => {
    expect(() =>
      approveRequestSchema.parse({ decision: "REJECTED", actor: "reviewer:1", notes: "insufficient" })
    ).not.toThrow();
  });
  it("rejects an unknown decision", () => {
    expect(() =>
      approveRequestSchema.parse({ decision: "MAYBE", actor: "reviewer:1" })
    ).toThrow();
  });
  it("requires actor", () => {
    expect(() =>
      approveRequestSchema.parse({ decision: "APPROVED" })
    ).toThrow();
  });
});