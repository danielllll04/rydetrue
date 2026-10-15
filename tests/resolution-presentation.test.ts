import { describe, expect, it } from "vitest";
import type { Recommendation } from "../src/frontend/lib/api-types";
import {
  resolutionTitle,
  resolutionDecision,
  resolutionExplanation,
  resolutionHistory,
} from "../src/frontend/lib/resolution-presentation";

function rec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: "rec-1",
    outcome: "REFUND_FULL",
    sufficiencyState: "SUFFICIENT",
    refundCents: 500,
    rationale: "Rule description. — Expanded policy note.",
    citations: [
      { evidenceId: "policy", ruleId: "TEST-RULE", note: "Synthetic fixture" },
    ],
    evidenceSnapshot: [],
    approvalState: "PENDING",
    approvedBy: null,
    policyCode: "TEST",
    policyVersion: 1,
    createdAt: "2026-10-15T00:00:00Z",
    ...overrides,
  };
}
const geotag = {
  evidenceId: "independent-1",
  refGroup: "third-party-geotag",
  type: "THIRD_PARTY_GEOTAG",
  version: 1,
  hash: "hash-1",
};

describe("Resolution wording follows persisted decisions", () => {
  it.each([
    ["APPROVED", "Full refund approved — S$5.00"],
    ["PENDING", "Full refund pending approval — S$5.00"],
    ["REJECTED", "Full refund recommendation rejected — S$5.00"],
    ["NOT_APPLICABLE", "Full refund recommended — S$5.00"],
  ] as const)(
    "labels %s without claiming a different decision",
    (approvalState, expected) => {
      const item = rec({ approvalState });
      expect(resolutionTitle(item)).toBe(expected);
      expect(item.outcome).toBe("REFUND_FULL");
      expect(item.approvalState).toBe(approvalState);
    },
  );
  it("uses the actual partial amount and never turns insufficient evidence into a refund", () => {
    expect(
      resolutionTitle(
        rec({
          outcome: "REFUND_PARTIAL",
          refundCents: 175,
          approvalState: "APPROVED",
        }),
      ),
    ).toBe("Partial refund approved — S$1.75");
    expect(
      resolutionTitle(
        rec({
          outcome: "INSUFFICIENT_EVIDENCE",
          refundCents: 0,
          approvalState: "NOT_APPLICABLE",
        }),
      ),
    ).toBe("More evidence needed");
  });
  it("distinguishes pending, rejected, not-applicable and absent decisions without null reviewer names", () => {
    expect(resolutionDecision(rec())).toContain("not approved");
    expect(
      resolutionDecision(
        rec({ approvalState: "REJECTED", approvedBy: "demo-reviewer" }),
      ),
    ).toContain("Human rejection recorded by demo-reviewer");
    expect(
      resolutionDecision(rec({ approvalState: "NOT_APPLICABLE" })),
    ).toContain("No refund approval is pending");
    expect(resolutionDecision(null)).toContain("No recommendation");
    expect(resolutionDecision(rec({ approvalState: "APPROVED" }))).not.toMatch(
      /null|undefined|pending/,
    );
  });
});

describe("Concise presentation preserves the original explanation", () => {
  it("shows the matched rule description once, leaving its expanded note untouched in the record", () => {
    const item = rec();
    const original = structuredClone(item);
    expect(resolutionExplanation(item)).toBe("Rule description.");
    expect(item).toEqual(original);
  });
  it("deduplicates exact repeated sentences without damaging decimal amounts or unique sentences", () => {
    const item = rec({
      citations: [],
      rationale:
        "Fee is S$5.00. Fee is S$5.00. Evidence conflicts. Human review required.",
    });
    expect(resolutionExplanation(item)).toBe(
      "Fee is S$5.00. Evidence conflicts. Human review required.",
    );
    expect(item.rationale.match(/Fee is/g)).toHaveLength(2);
  });
  it("retains an em dash inside an unmatched-rule explanation", () => {
    const item = rec({
      citations: [],
      rationale: "No rule matched — human review is required.",
    });
    expect(resolutionExplanation(item)).toBe(item.rationale);
  });
});

describe("Persisted before/after history", () => {
  it("shows evidence transition between the actual assessments, even when a later retry has the same snapshot", () => {
    const initial = rec({
      id: "initial",
      outcome: "INSUFFICIENT_EVIDENCE",
      refundCents: 0,
    });
    const later = rec({
      id: "later",
      createdAt: "2026-10-15T00:02:00Z",
      evidenceSnapshot: [geotag],
    });
    const retry = rec({
      id: "retry",
      createdAt: "2026-10-15T00:03:00Z",
      evidenceSnapshot: [geotag],
    });
    const detail = {
      recommendationHistory: [retry, initial, later],
      audit: [
        {
          id: "submitted",
          action: "SUBMIT_EVIDENCE",
          actor: "test",
          createdAt: "2026-10-15T00:01:00Z",
          payload: { evidenceId: geotag.evidenceId },
        },
      ],
    };
    const original = structuredClone(detail);
    const result = resolutionHistory(detail);
    expect(result.map((row) => row.item.id)).toEqual([
      "initial",
      "later",
      "retry",
    ]);
    expect(result[0].item.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(result[1].additions).toEqual([
      { ...geotag, submittedAt: "2026-10-15T00:01:00Z" },
    ]);
    expect(result[2].additions).toEqual([]);
    expect(detail).toEqual(original);
  });
  it("does not invent an initial gap, new geotag or submission date", () => {
    const detail = {
      recommendationHistory: [rec({ evidenceSnapshot: [geotag] })],
      audit: [],
    };
    const result = resolutionHistory(detail);
    expect(result[0].item.outcome).toBe("REFUND_FULL");
    expect(result[0].additions).toEqual([]);
    detail.recommendationHistory.push(
      rec({
        id: "v2",
        createdAt: "2026-10-15T00:02:00Z",
        evidenceSnapshot: [
          {
            ...geotag,
            version: 2,
            hash: "hash-2",
            evidenceId: "independent-2",
          },
        ],
      }),
    );
    expect(
      resolutionHistory(detail)[1].additions[0].submittedAt,
    ).toBeUndefined();
  });
});
