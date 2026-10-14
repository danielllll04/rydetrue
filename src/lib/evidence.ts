/**
 * Evidence retrieval & versioning.
 *
 * Goals:
 *  - Retrieve the *latest* version of each logical evidence group.
 *  - Verify content hash matches payload (chain-of-custody).
 *  - Append new evidence versions without overwriting old ones.
 *  - Provide typed accessors for GPS_PING trails, CHAT_LOG, etc.
 */

import { createHash } from "node:crypto";
import { Evidence } from "@prisma/client";
import { EvidencePayload, GpsPing } from "./schemas";

/**
 * Canonical JSON for hashing - sorted keys at every level, undefined values
 * stripped (JSON.stringify drops them on the round trip, so they must not be
 * included in the canonical form either).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>)
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .sort();
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonicalJson((value as Record<string, unknown>)[k])
      )
      .join(",") +
    "}"
  );
}

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export interface EvidenceGroup<T = EvidencePayload> {
  refGroup: string;
  type: string;
  source: string;
  latest: { id: number | string; version: number; capturedAt: Date; payload: T; hash: string };
  history: Array<{ id: number | string; version: number; capturedAt: Date; hash: string }>;
}

/** Parse + validate payload JSON. Throws if invalid. */
export function parsePayload(raw: string): EvidencePayload {
  const obj = JSON.parse(raw);
  // Late-imported schemas are resolved at call site via runtime validator.
  return obj as EvidencePayload;
}

/**
 * Group evidence by refGroup, returning only the highest version per group.
 * Caller supplies the full evidence list for a dispute (already filtered by disputeId).
 */
export function groupLatestByRefGroup(records: Evidence[]): EvidenceGroup[] {
  const byGroup = new Map<string, Evidence[]>();
  for (const r of records) {
    const list = byGroup.get(r.refGroup) ?? [];
    list.push(r);
    byGroup.set(r.refGroup, list);
  }

  const out: EvidenceGroup[] = [];
  for (const [refGroup, list] of byGroup.entries()) {
    const sorted = [...list].sort((a, b) => b.version - a.version);
    const latest = sorted[0];
    out.push({
      refGroup,
      type: latest.type,
      source: latest.source,
      latest: {
        id: latest.id,
        version: latest.version,
        capturedAt: latest.capturedAt,
        payload: JSON.parse(latest.payload),
        hash: latest.hash,
      },
      history: sorted.map((e) => ({
        id: e.id,
        version: e.version,
        capturedAt: e.capturedAt,
        hash: e.hash,
      })),
    });
  }
  return out;
}

/** Extract a GPS trail from a typed evidence group. Throws if type != GPS_PING. */
export function extractGpsTrail(group: EvidenceGroup): GpsPing[] {
  const p = group.latest.payload;
  if (p.type !== "GPS_PING") {
    throw new Error(`Evidence group ${group.refGroup} is not GPS_PING (got ${p.type})`);
  }
  return p.trail;
}

/** Convenience: find the last (most recent) GPS ping in a trail. */
export function lastGpsPing(trail: GpsPing[]): GpsPing {
  if (trail.length === 0) throw new Error("Empty GPS trail");
  return trail[trail.length - 1];
}

/** Verify the hash stored on a record matches its payload. */
export function verifyHash(record: Evidence): boolean {
  return record.hash === hashPayload(JSON.parse(record.payload));
}