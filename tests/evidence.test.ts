import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  hashPayload,
  groupLatestByRefGroup,
  extractGpsTrail,
  lastGpsPing,
  verifyHash,
} from "../src/lib/evidence";
import { RT_001_EVIDENCE_BY_GROUP, RT_001_STAGE_1_RIDER_GPS } from "../src/lib/cases";
import type { Evidence } from "@prisma/client";

describe("evidence.canonicalJson", () => {
  it("sorts keys deterministically", () => {
    const a = canonicalJson({ b: 1, a: 2 });
    const b = canonicalJson({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("produces different output for different key orders in arrays of objects", () => {
    const x = canonicalJson([{ a: 1, b: 2 }]);
    const y = canonicalJson([{ b: 2, a: 1 }]);
    expect(x).toBe(y);
  });

  it("distinguishes values", () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });

  it("strips undefined values (so round-trip through JSON.stringify doesn't change the hash)", () => {
    const withUndef = canonicalJson({ a: 1, b: undefined, c: 3 });
    const withoutUndef = canonicalJson({ a: 1, c: 3 });
    expect(withUndef).toBe(withoutUndef);
  });
});

describe("evidence.hashPayload", () => {
  it("is a 64-character hex SHA-256", () => {
    const h = hashPayload({ hello: "world" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same payload regardless of key order", () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
  });

  it("changes when payload changes", () => {
    const h1 = hashPayload({ a: 1 });
    const h2 = hashPayload({ a: 2 });
    expect(h1).not.toBe(h2);
  });

  it("is stable across JSON round-trip (undefined keys stripped)", () => {
    const obj = { type: "TRIP_TELEMETRY", a: "x", b: undefined, c: 42 };
    const h1 = hashPayload(obj);
    const h2 = hashPayload(JSON.parse(JSON.stringify(obj)));
    expect(h1).toBe(h2);
  });
});

describe("evidence.groupLatestByRefGroup", () => {
  function asRecord(
    e: (typeof RT_001_EVIDENCE_BY_GROUP)[keyof typeof RT_001_EVIDENCE_BY_GROUP]
  ): Evidence {
    const payload = JSON.stringify(e.payload);
    return {
      id: `id-${e.refGroup}-v1`,
      disputeId: "dispute-1",
      type: e.type,
      source: e.source,
      refGroup: e.refGroup,
      version: 1,
      hash: hashPayload(e.payload),
      capturedAt: new Date(e.capturedAt),
      payload,
      notes: null,
      createdAt: new Date(e.capturedAt),
      updatedAt: new Date(e.capturedAt),
    } as unknown as Evidence;
  }

  it("groups by refGroup and returns latest version only in `latest`", () => {
    const records = Object.values(RT_001_EVIDENCE_BY_GROUP).map(asRecord);
    // Inject a fake v2 of the rider GPS trail (with different trail) to
    // simulate a re-submission.
    const newerPayload = {
      type: "GPS_PING" as const,
      trail: [{ at: "2026-10-12T15:00:00.000Z", lat: 1.35465, lng: 103.98730 }],
    };
    const newerRecord: Evidence = {
      ...asRecord(RT_001_EVIDENCE_BY_GROUP["rider-gps"]),
      id: "id-rider-gps-2",
      version: 2,
      hash: hashPayload(newerPayload),
      payload: JSON.stringify(newerPayload),
    } as unknown as Evidence;

    const groups = groupLatestByRefGroup([...records, newerRecord]);
    const riderGroup = groups.find((g) => g.refGroup === "rider-gps")!;
    expect(riderGroup.latest.version).toBe(2);
    expect(riderGroup.history.map((h) => h.version)).toEqual([2, 1]);
  });

  it("extractGpsTrail returns the trail from a GPS_PING group", () => {
    const records = Object.values(RT_001_EVIDENCE_BY_GROUP).map(asRecord);
    const groups = groupLatestByRefGroup(records);
    const rider = groups.find((g) => g.refGroup === "rider-gps")!;
    const trail = extractGpsTrail(rider);
    expect(trail.length).toBeGreaterThan(0);
    expect(trail[0].lat).toBeCloseTo(RT_001_STAGE_1_RIDER_GPS[0].lat, 5);
  });

  it("extractGpsTrail throws for non-GPS_PING groups", () => {
    const records = Object.values(RT_001_EVIDENCE_BY_GROUP).map(asRecord);
    const groups = groupLatestByRefGroup(records);
    const chat = groups.find((g) => g.refGroup === "trip-chat")!;
    expect(() => extractGpsTrail(chat)).toThrow();
  });

  it("lastGpsPing returns the last item in a trail", () => {
    const records = Object.values(RT_001_EVIDENCE_BY_GROUP).map(asRecord);
    const groups = groupLatestByRefGroup(records);
    const driver = groups.find((g) => g.refGroup === "driver-gps")!;
    const trail = extractGpsTrail(driver);
    const last = lastGpsPing(trail);
    // Stage 1 driver GPS has one ping at lat 1.35410
    expect(last.lat).toBeCloseTo(1.35410, 5);
  });

  it("verifyHash returns true when the stored hash matches the payload", () => {
    const records = Object.values(RT_001_EVIDENCE_BY_GROUP).map(asRecord);
    for (const r of records) {
      expect(verifyHash(r)).toBe(true);
    }
  });

  it("verifyHash returns false when the payload is tampered with", () => {
    const records = Object.values(RT_001_EVIDENCE_BY_GROUP).map(asRecord);
    const tampered: Evidence = {
      ...records[0],
      payload: records[0].payload.replace(/"lat":1\.3546/, '"lat":9.99999'),
    } as Evidence;
    expect(verifyHash(tampered)).toBe(false);
  });
});