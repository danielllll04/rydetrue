import { describe, expect, it } from "vitest";
import type { CaseDetail, Recommendation } from "../src/frontend/lib/api-types";
import {
  canReview,
  evidenceLabel,
  investigationJourney,
  outcomeLabel,
  readableFindingText,
  reviewBlockReason,
} from "../src/frontend/lib/view-model";

// Deliberately small synthetic transport fixtures; never model outputs or live data.
const snapshot = {
  evidenceId: "record-rider-v1",
  refGroup: "rider-gps",
  type: "GPS_PING",
  version: 1,
  hash: "hash-1",
};
const recommendation: Recommendation = {
  id: "rec-1",
  outcome: "REFUND_PARTIAL",
  sufficiencyState: "SUFFICIENT",
  refundCents: 250,
  rationale: "Synthetic recorded rationale",
  citations: [],
  evidenceSnapshot: [snapshot],
  approvalState: "PENDING",
  policyCode: "TEST",
  policyVersion: 1,
  createdAt: "2026-10-15T00:00:00Z",
  isCurrent: true,
};
function fixture(): CaseDetail {
  return {
    caseCode: "UI-TEST",
    category: "CANCELLATION_FEE",
    status: "AWAITING_APPROVAL",
    summary: "Synthetic UI fixture",
    openedAt: "2026-10-15T00:00:00Z",
    closedAt: null,
    trip: {
      caseCode: "UI-TEST",
      city: "Singapore",
      status: "CANCELLED",
      requestedAt: "2026-10-15T00:00:00Z",
      acceptedAt: null,
      cancelledAt: null,
      pickup: { label: "Pickup", lat: 1, lng: 103 },
      dropoff: { label: "Dropoff", lat: 1, lng: 103 },
      fareAmountCents: 1000,
      currency: "SGD",
      cancellationFeeCents: 500,
    },
    statements: [],
    findings: [],
    audit: [],
    evidence: {
      groups: [
        {
          refGroup: "rider-gps",
          type: "GPS_PING",
          source: "RIDER_PHONE",
          latestVersion: 1,
          latestCapturedAt: "2026-10-15T00:00:00Z",
          latestHash: "hash-1",
          historyVersions: [1],
          payload: {},
        },
      ],
      integrity: [
        {
          id: snapshot.evidenceId,
          refGroup: snapshot.refGroup,
          type: snapshot.type,
          version: 1,
          hashMatches: true,
          recomputedHash: "hash-1",
        },
      ],
    },
    currentRecommendation: structuredClone(recommendation),
    recommendationHistory: [structuredClone(recommendation)],
  };
}

describe("Human decision presentation gates", () => {
  it("allows a fresh pending partial refund without assuming a full-refund outcome", () => {
    expect(canReview(fixture())).toBe(true);
    expect(reviewBlockReason(fixture())).toBeNull();
  });
  it.each([
    ["no recommendation", "Run an investigation"],
    ["insufficient", "not sufficient"],
    ["contradictory", "not sufficient"],
    ["stale", "outside this snapshot"],
    ["integrity failure", "verification"],
    ["missing integrity", "verification"],
    ["superseded", "replaced"],
    ["not current", "replaced"],
    ["no refund", "no pending refund"],
    ["not applicable", "no pending refund"],
    ["approved", "already recorded"],
    ["rejected", "already recorded"],
    ["investigating", "in progress"],
    ["closed case", "closed or already decided"],
  ])("explains and blocks %s", (state, reason) => {
    const detail = fixture();
    const rec = detail.currentRecommendation!;
    if (state === "no recommendation") detail.currentRecommendation = null;
    if (state === "insufficient")
      rec.sufficiencyState = "INSUFFICIENT_EVIDENCE";
    if (state === "contradictory")
      rec.sufficiencyState = "CONTRADICTORY_EVIDENCE";
    if (state === "stale") detail.evidence.groups[0].latestVersion = 2;
    if (state === "integrity failure")
      detail.evidence.integrity[0].hashMatches = false;
    if (state === "missing integrity") detail.evidence.integrity = [];
    if (state === "superseded") rec.supersededById = "new-rec";
    if (state === "not current") rec.isCurrent = false;
    if (state === "no refund") rec.refundCents = 0;
    if (state === "not applicable") rec.approvalState = "NOT_APPLICABLE";
    if (state === "approved") rec.approvalState = "APPROVED";
    if (state === "rejected") rec.approvalState = "REJECTED";
    if (state === "investigating") detail.status = "INVESTIGATING";
    if (state === "closed case") detail.status = "CLOSED";
    expect(canReview(detail)).toBe(false);
    expect(reviewBlockReason(detail)).toContain(reason);
  });
});

describe("Readable evidence and real state journey", () => {
  it("retains exact historical versions and unknown references rather than substituting newer evidence", () => {
    const detail = fixture();
    detail.evidence.groups[0].latestVersion = 2;
    detail.evidence.integrity.push({
      ...detail.evidence.integrity[0],
      id: "record-rider-v2",
      version: 2,
    });
    expect(evidenceLabel(detail, "record-rider-v1")).toBe("Rider GPS · v1");
    expect(evidenceLabel(detail, "record-rider-v2")).toBe("Rider GPS · v2");
    expect(evidenceLabel(detail, "unknown-record")).toBe("Evidence record");
    const original = "Claim cites record-rider-v1 and unknown-record.";
    expect(readableFindingText(detail, original)).toBe(
      "Claim cites Rider GPS · v1 and unknown-record.",
    );
    expect(original).toContain("record-rider-v1");
  });
  it("uses the recorded first outcome rather than assuming initial insufficiency", () => {
    const detail = fixture();
    expect(investigationJourney(detail)[0].description).toBe(
      "Partial refund recommended",
    );
    expect(investigationJourney(detail)[1].complete).toBe(false);
    expect(investigationJourney(detail)[3].description).toContain("Ready");
    detail.currentRecommendation = null;
    detail.recommendationHistory = [];
    expect(investigationJourney(detail)[0].current).toBe(true);
    expect(investigationJourney(detail)[3].complete).toBe(false);
  });
  it("distinguishes newly recorded evidence from an actually completed reinvestigation", () => {
    const detail = fixture();
    detail.evidence.groups[0].type = "THIRD_PARTY_GEOTAG";
    detail.evidence.groups[0].latestVersion = 2;
    expect(investigationJourney(detail)[1].complete).toBe(true);
    expect(investigationJourney(detail)[2]).toMatchObject({
      complete: false,
      current: true,
      description: "New evidence awaits investigation",
    });
    detail.currentRecommendation!.evidenceSnapshot[0].version = 2;
    detail.evidence.integrity[0].version = 2;
    detail.recommendationHistory.push(detail.currentRecommendation!);
    detail.audit.push({
      id: "complete",
      action: "INVESTIGATION_COMPLETE",
      actor: "test",
      createdAt: "2026-10-15T00:01:00Z",
      payload: {
        recommendationId: "rec-1",
        investigationId: "inv-test",
        status: "ESCALATED",
      },
    });
    expect(investigationJourney(detail)[2].complete).toBe(false);
    detail.audit[0].payload.status = "COMPLETED";
    expect(investigationJourney(detail)[2].complete).toBe(true);
    detail.currentRecommendation!.approvalState = "REJECTED";
    expect(investigationJourney(detail)[3].description).toContain("Rejected");
  });
  it("labels every documented recommendation outcome without changing its value", () => {
    for (const value of [
      "REFUND_FULL",
      "REFUND_PARTIAL",
      "NO_REFUND",
      "SPLIT",
      "INSUFFICIENT_EVIDENCE",
      "ESCALATE_FOR_REVIEW",
      "INCONCLUSIVE",
    ])
      expect(outcomeLabel(value)).not.toContain("_");
    expect(recommendation.outcome).toBe("REFUND_PARTIAL");
  });
  it("directs changed phone evidence to reinvestigation even without an independent geotag", () => {
    const detail = fixture();
    detail.evidence.groups[0].latestVersion = 2;
    expect(investigationJourney(detail)[2].current).toBe(true);
    expect(investigationJourney(detail)[1].current).toBe(false);
  });
});
