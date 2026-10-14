import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "../src/lib/policy";
import {
  RT_001_POLICY,
  RT_001_PICKUP,
  RT_001_STAGE_1_RIDER_GPS,
  RT_001_STAGE_1_DRIVER_GPS,
  RT_001_DESIGNATED_ENTRANCE,
  RT_001_DRIVER_ACTUAL_LOCATION,
} from "../src/lib/cases";
import type { ThirdPartyGeotag } from "../src/lib/sufficiency";

const GEOTAG: ThirdPartyGeotag = {
  designatedEntrance: { lat: RT_001_DESIGNATED_ENTRANCE.lat, lng: RT_001_DESIGNATED_ENTRANCE.lng },
  driverActualLocation: { lat: RT_001_DRIVER_ACTUAL_LOCATION.lat, lng: RT_001_DRIVER_ACTUAL_LOCATION.lng },
  capturedAt: "2026-10-12T14:33:20.000Z",
  providerName: "Changi Airport Ground Operations Log",
};

function makeCtx(overrides: Partial<Parameters<typeof evaluatePolicy>[0]> = {}) {
  return {
    pickup: { lat: RT_001_PICKUP.lat, lng: RT_001_PICKUP.lng },
    riderGpsTrail: RT_001_STAGE_1_RIDER_GPS,
    driverGpsTrail: RT_001_STAGE_1_DRIVER_GPS,
    thirdPartyGeotag: GEOTAG,
    fareCents: 1850,
    cancellationFeeCents: 500,
    waitSeconds: 180,
    hasRiderStatement: true,
    hasDriverStatement: true,
    hasTripTelemetry: true,
    evidenceById: new Map(),
    ...overrides,
  };
}

describe("policy.evaluatePolicy — RT-001 Changi Airport", () => {
  it("resolves to REFUND_FULL when geotag shows driver at wrong entrance (sufficient evidence)", () => {
    const result = evaluatePolicy(makeCtx(), RT_001_POLICY, "SUFFICIENT");
    expect(result.outcome).toBe("REFUND_FULL");
    expect(result.refundCents).toBe(500);
    expect(result.matchedRuleId).toBe("SG-CXL-R1");
    expect(result.sufficiencyState).toBe("SUFFICIENT");
    expect(result.policyCode).toBe("CANCELLATION_FEE_SG");
    expect(result.policyVersion).toBe(2);
    expect(result.metrics.driverDistanceToDesignatedEntranceM).toBeGreaterThan(30);
    expect(result.citations.some((c) => c.evidenceId === "third-party-geotag")).toBe(true);
  });

  it("resolves to NO_REFUND when geotag shows driver at designated entrance and waited", () => {
    const atEntrance: ThirdPartyGeotag = {
      ...GEOTAG,
      driverActualLocation: { lat: RT_001_DESIGNATED_ENTRANCE.lat, lng: RT_001_DESIGNATED_ENTRANCE.lng },
    };
    const result = evaluatePolicy(
      makeCtx({ thirdPartyGeotag: atEntrance }),
      RT_001_POLICY,
      "SUFFICIENT"
    );
    expect(result.outcome).toBe("NO_REFUND");
    expect(result.matchedRuleId).toBe("SG-CXL-R2");
    expect(result.refundCents).toBe(0);
  });

  it("returns INSUFFICIENT_EVIDENCE when sufficiency is not SUFFICIENT (no geotag)", () => {
    const result = evaluatePolicy(
      makeCtx({ thirdPartyGeotag: null }),
      RT_001_POLICY,
      "INSUFFICIENT_EVIDENCE"
    );
    expect(result.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.sufficiencyState).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.matchedRuleId).toBeNull();
    expect(result.refundCents).toBe(0);
    expect(result.rationale).toContain("INSUFFICIENT_EVIDENCE");
    // Must not accuse either party of dishonesty.
    expect(result.rationale.toLowerCase()).not.toContain("dishonest");
    expect(result.rationale.toLowerCase()).not.toContain("lying");
  });

  it("returns ESCALATE_FOR_REVIEW when sufficiency is ESCALATE_FOR_REVIEW", () => {
    const result = evaluatePolicy(makeCtx(), RT_001_POLICY, "ESCALATE_FOR_REVIEW");
    expect(result.outcome).toBe("ESCALATE_FOR_REVIEW");
    expect(result.matchedRuleId).toBeNull();
    expect(result.refundCents).toBe(0);
  });

  it("returns INCONCLUSIVE when sufficiency is CONTRADICTORY_EVIDENCE", () => {
    const result = evaluatePolicy(makeCtx(), RT_001_POLICY, "CONTRADICTORY_EVIDENCE");
    expect(result.outcome).toBe("INCONCLUSIVE");
    expect(result.refundCents).toBe(0);
    expect(result.matchedRuleId).toBeNull();
  });

  it("does NOT refund based on GPS proximity alone (no geotag, but sufficient)", () => {
    // Even if sufficiency is SUFFICIENT (hypothetically), without a geotag
    // the rules requiring geotag won't match, and the fallback is ESCALATE.
    const result = evaluatePolicy(
      makeCtx({ thirdPartyGeotag: null }),
      RT_001_POLICY,
      "SUFFICIENT"
    );
    expect(result.matchedRuleId).toBeNull();
    expect(result.outcome).toBe("ESCALATE_FOR_REVIEW");
    expect(result.refundCents).toBe(0);
  });

  it("is deterministic — running twice yields identical output", () => {
    const a = evaluatePolicy(makeCtx(), RT_001_POLICY, "SUFFICIENT");
    const b = evaluatePolicy(makeCtx(), RT_001_POLICY, "SUFFICIENT");
    expect(a).toEqual(b);
  });

  it("is pure — does not mutate the policy or context", () => {
    const ctx = makeCtx();
    const policySnapshot = JSON.stringify(RT_001_POLICY);
    const ctxSnapshot = JSON.stringify({
      pickup: ctx.pickup,
      riderGpsTrail: ctx.riderGpsTrail,
      driverGpsTrail: ctx.driverGpsTrail,
      thirdPartyGeotag: ctx.thirdPartyGeotag,
      fareCents: ctx.fareCents,
      cancellationFeeCents: ctx.cancellationFeeCents,
      waitSeconds: ctx.waitSeconds,
    });
    evaluatePolicy(ctx, RT_001_POLICY, "SUFFICIENT");
    expect(JSON.stringify(RT_001_POLICY)).toBe(policySnapshot);
    expect(
      JSON.stringify({
        pickup: ctx.pickup,
        riderGpsTrail: ctx.riderGpsTrail,
        driverGpsTrail: ctx.driverGpsTrail,
        thirdPartyGeotag: ctx.thirdPartyGeotag,
        fareCents: ctx.fareCents,
        cancellationFeeCents: ctx.cancellationFeeCents,
        waitSeconds: ctx.waitSeconds,
      })
    ).toBe(ctxSnapshot);
  });
});