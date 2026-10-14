import { describe, it, expect } from "vitest";
import { haversineMeters, bearingDeg, round } from "../src/lib/geo";
import {
  RT_001_PICKUP,
  RT_001_DESIGNATED_ENTRANCE,
  RT_001_DRIVER_ACTUAL_LOCATION,
  RT_001_STAGE_1_RIDER_GPS,
  RT_001_STAGE_1_DRIVER_GPS,
} from "../src/lib/cases";

describe("geo.haversineMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMeters({ lat: 1.35457, lng: 103.98725 }, { lat: 1.35457, lng: 103.98725 })).toBe(0);
  });

  it("matches reference distance for Changi Airport T3 to East Coast Park (≈5.5 km)", () => {
    const changi = { lat: 1.35457, lng: 103.98725 };
    const eastCoast = { lat: 1.31100, lng: 103.96500 };
    const d = haversineMeters(changi, eastCoast);
    expect(d).toBeGreaterThan(5200);
    expect(d).toBeLessThan(5700);
  });

  it("is symmetric", () => {
    const a = { lat: 1.35457, lng: 103.98725 };
    const b = { lat: 1.35500, lng: 103.98800 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it("matches the RT-001 designated entrance vs driver actual location distance (≈ 100 m)", () => {
    const d = haversineMeters(
      { lat: RT_001_DESIGNATED_ENTRANCE.lat, lng: RT_001_DESIGNATED_ENTRANCE.lng },
      { lat: RT_001_DRIVER_ACTUAL_LOCATION.lat, lng: RT_001_DRIVER_ACTUAL_LOCATION.lng }
    );
    expect(d).toBeGreaterThan(85);
    expect(d).toBeLessThan(115);
  });

  it("matches the RT-001 rider GPS vs pickup distance (≤ 15 m, vague GPS)", () => {
    const riderLast = {
      lat: RT_001_STAGE_1_RIDER_GPS[0].lat,
      lng: RT_001_STAGE_1_RIDER_GPS[0].lng,
    };
    const d = haversineMeters(
      { lat: RT_001_PICKUP.lat, lng: RT_001_PICKUP.lng },
      riderLast
    );
    expect(d).toBeLessThan(20);
  });

  it("matches the RT-001 driver GPS vs pickup distance (≈ 70 m, vague GPS)", () => {
    const driverLast = {
      lat: RT_001_STAGE_1_DRIVER_GPS[0].lat,
      lng: RT_001_STAGE_1_DRIVER_GPS[0].lng,
    };
    const d = haversineMeters(
      { lat: RT_001_PICKUP.lat, lng: RT_001_PICKUP.lng },
      driverLast
    );
    expect(d).toBeGreaterThan(55);
    expect(d).toBeLessThan(90);
  });

  it("is stable for negative coordinates (Southern hemisphere)", () => {
    const a = { lat: -33.8688, lng: 151.2093 }; // Sydney
    const b = { lat: -33.8570, lng: 151.2150 };
    const d = haversineMeters(a, b);
    expect(d).toBeGreaterThan(1400);
    expect(d).toBeLessThan(1600);
  });
});

describe("geo.bearingDeg", () => {
  it("is in [0, 360)", () => {
    const b = bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 1 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe("geo.round", () => {
  it("rounds to N decimals", () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(1.23556, 2)).toBe(1.24);
    expect(round(1.23456, 0)).toBe(1);
  });
});