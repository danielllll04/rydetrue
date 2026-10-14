import { describe, it, expect } from "vitest";
import { checkSufficiency } from "../src/lib/sufficiency";
import {
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

describe("sufficiency.checkSufficiency", () => {
  it("returns INSUFFICIENT_EVIDENCE when no THIRD_PARTY_GEOTAG is present (Stage 1)", () => {
    const result = checkSufficiency({
      hasRiderStatement: true,
      hasDriverStatement: true,
      hasTripTelemetry: true,
      riderGpsTrail: RT_001_STAGE_1_RIDER_GPS,
      driverGpsTrail: RT_001_STAGE_1_DRIVER_GPS,
      thirdPartyGeotag: null,
    });
    expect(result.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.missingRequirements).toContain("THIRD_PARTY_GEOTAG");
    expect(result.reasons.some((r) => r.includes("GPS proximity alone"))).toBe(true);
  });

  it("returns SUFFICIENT when all required evidence is present (Stage 2)", () => {
    const result = checkSufficiency({
      hasRiderStatement: true,
      hasDriverStatement: true,
      hasTripTelemetry: true,
      riderGpsTrail: RT_001_STAGE_1_RIDER_GPS,
      driverGpsTrail: RT_001_STAGE_1_DRIVER_GPS,
      thirdPartyGeotag: GEOTAG,
    });
    expect(result.state).toBe("SUFFICIENT");
    expect(result.missingRequirements.length).toBe(0);
  });

  it("returns INSUFFICIENT_EVIDENCE when rider statement is missing", () => {
    const result = checkSufficiency({
      hasRiderStatement: false,
      hasDriverStatement: true,
      hasTripTelemetry: true,
      riderGpsTrail: [],
      driverGpsTrail: RT_001_STAGE_1_DRIVER_GPS,
      thirdPartyGeotag: GEOTAG,
    });
    expect(result.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.missingRequirements).toContain("RIDER_STATEMENT");
  });

  it("returns INSUFFICIENT_EVIDENCE when driver statement is missing", () => {
    const result = checkSufficiency({
      hasRiderStatement: true,
      hasDriverStatement: false,
      hasTripTelemetry: true,
      riderGpsTrail: RT_001_STAGE_1_RIDER_GPS,
      driverGpsTrail: [],
      thirdPartyGeotag: GEOTAG,
    });
    expect(result.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.missingRequirements).toContain("DRIVER_STATEMENT");
  });

  it("returns INSUFFICIENT_EVIDENCE when trip telemetry is missing", () => {
    const result = checkSufficiency({
      hasRiderStatement: true,
      hasDriverStatement: true,
      hasTripTelemetry: false,
      riderGpsTrail: RT_001_STAGE_1_RIDER_GPS,
      driverGpsTrail: RT_001_STAGE_1_DRIVER_GPS,
      thirdPartyGeotag: GEOTAG,
    });
    expect(result.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.missingRequirements).toContain("TRIP_TELEMETRY");
  });

  it("returns CONTRADICTORY_EVIDENCE when GPS and geotag disagree by > 100m", () => {
    const contradictoryGeotag: ThirdPartyGeotag = {
      ...GEOTAG,
      // Place the geotag's driver location far from the GPS trail's last ping
      driverActualLocation: { lat: 1.36000, lng: 103.99000 }, // ~700m away
    };
    const result = checkSufficiency({
      hasRiderStatement: true,
      hasDriverStatement: true,
      hasTripTelemetry: true,
      riderGpsTrail: RT_001_STAGE_1_RIDER_GPS,
      driverGpsTrail: RT_001_STAGE_1_DRIVER_GPS, // last ping at ~1.35410, 103.98660
      thirdPartyGeotag: contradictoryGeotag,
    });
    expect(result.state).toBe("CONTRADICTORY_EVIDENCE");
    expect(result.reasons.some((r) => r.includes("disagree"))).toBe(true);
  });

  it("does NOT return SUFFICIENT with GPS alone (no geotag, even with precise GPS)", () => {
    const preciseGps = [{ at: "2026-10-12T14:31:00.000Z", lat: 1.35457, lng: 103.98725, accuracyM: 5 }];
    const result = checkSufficiency({
      hasRiderStatement: true,
      hasDriverStatement: true,
      hasTripTelemetry: true,
      riderGpsTrail: preciseGps,
      driverGpsTrail: preciseGps,
      thirdPartyGeotag: null,
    });
    expect(result.state).not.toBe("SUFFICIENT");
    expect(result.missingRequirements).toContain("THIRD_PARTY_GEOTAG");
  });

  it("flags low-accuracy GPS as a reason (but doesn't block if geotag is present)", () => {
    const result = checkSufficiency({
      hasRiderStatement: true,
      hasDriverStatement: true,
      hasTripTelemetry: true,
      riderGpsTrail: RT_001_STAGE_1_RIDER_GPS, // accuracy 80m
      driverGpsTrail: RT_001_STAGE_1_DRIVER_GPS, // accuracy 80m
      thirdPartyGeotag: GEOTAG,
    });
    expect(result.state).toBe("SUFFICIENT");
    expect(result.reasons.some((r) => r.includes("80m"))).toBe(true);
  });
});