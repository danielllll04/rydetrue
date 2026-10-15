import { describe, expect, it } from "vitest";
import { fareEvidenceSchema } from "../src/lib/fare-contracts";
import {
  evaluateFare,
  FARE_POLICY_CODE,
  FARE_POLICY_RULES,
  type FareInput,
} from "../src/lib/fare-policy";
import {
  RT_002_QUOTE,
  RT_002_RECEIPT,
  RT_002_PRICING_AUDIT,
} from "../src/lib/fare-case";
import { evidencePayloadSchema } from "../src/lib/schemas";
import { hashPayload, type EvidenceGroup } from "../src/lib/evidence";
import { addFareCase } from "../src/lib/fixtures/add-fare-case";
import { prisma } from "../src/lib/db";

function input(): FareInput {
  const payloads = [RT_002_QUOTE, RT_002_RECEIPT, RT_002_PRICING_AUDIT].map(
    (p) => structuredClone(p),
  );
  const groups: EvidenceGroup[] = payloads.map((p, i) => ({
    type: p.type,
    source: p.type === "FARE_ADJUSTMENT_RECORD" ? "THIRD_PARTY" : "PLATFORM",
    refGroup: p.type,
    latest: {
      id: `evidence-${i}`,
      version: 1,
      capturedAt: new Date(),
      payload: evidencePayloadSchema.parse(p),
      hash: hashPayload(p),
    },
    history: [],
  }));
  return {
    caseCode: "RT-002",
    currency: "SGD",
    tripStatus: "COMPLETED",
    chargedCents: 2900,
    hasRiderStatement: true,
    hasDriverStatement: true,
    groups,
  };
}
const policy = { code: FARE_POLICY_CODE, version: 1, rules: FARE_POLICY_RULES };
describe("Fare evidence and pure deterministic policy", () => {
  it("computes the excess from quote, permitted extras and actual charge with citations", () => {
    const result = evaluateFare(input(), policy);
    expect(result.sufficiency.state).toBe("SUFFICIENT");
    expect(result.evaluation).toMatchObject({
      outcome: "REFUND_PARTIAL",
      refundCents: 600,
      matchedRuleId: "SG-FARE-R1",
    });
    expect(result.evaluation.metrics.fare).toEqual({
      quotedCents: 2000,
      permittedExtrasCents: 300,
      allowedCents: 2300,
      chargedCents: 2900,
      excessCents: 600,
    });
    expect(result.evaluation.citations.map((c) => c.evidenceId)).toEqual([
      "evidence-0",
      "evidence-1",
      "evidence-2",
      "policy",
    ]);
  });
  it("changes the computed refund when the receipt changes, without mutating inputs", () => {
    const data = input();
    const receipt = data.groups[1].latest.payload;
    if (receipt.type !== "FARE_RECEIPT") throw Error("fixture");
    receipt.chargedCents = 2700;
    receipt.extras[1].amountCents = 400;
    data.chargedCents = 2700;
    const before = structuredClone(data);
    expect(evaluateFare(data, policy).evaluation.refundCents).toBe(400);
    expect(data).toEqual(before);
  });
  it("produces no refund when all charged extras are explicitly permitted", () => {
    const data = input();
    const audit = data.groups[2].latest.payload;
    if (audit.type !== "FARE_ADJUSTMENT_RECORD") throw Error("fixture");
    audit.extras[1].permitted = true;
    audit.extras[1].permittedCents = 600;
    expect(evaluateFare(data, policy).evaluation).toMatchObject({
      outcome: "NO_REFUND",
      refundCents: 0,
    });
  });
  it.each([
    "missing quote",
    "missing receipt",
    "missing audit",
    "missing statement",
    "unverified audit",
    "incomplete audit",
    "missing extra authorization",
  ])("blocks unsupported refunds with %s", (state) => {
    const data = input();
    if (state === "missing quote") data.groups.splice(0, 1);
    if (state === "missing receipt") data.groups.splice(1, 1);
    if (state === "missing audit") data.groups.splice(2, 1);
    if (state === "missing statement") data.hasDriverStatement = false;
    const audit = data.groups.find((g) => g.type === "FARE_ADJUSTMENT_RECORD")
      ?.latest.payload;
    if (audit?.type === "FARE_ADJUSTMENT_RECORD") {
      if (state === "unverified audit") audit.verification = "UNVERIFIED";
      if (state === "incomplete audit") audit.complete = false;
      if (state === "missing extra authorization") audit.extras.pop();
    }
    const result = evaluateFare(data, policy);
    expect(result.sufficiency.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.evaluation).toMatchObject({
      outcome: "INSUFFICIENT_EVIDENCE",
      refundCents: 0,
      matchedRuleId: null,
    });
  });
  it.each([
    "case",
    "charge",
    "source",
    "trip status",
    "duplicate group",
    "quote identity",
    "audit timing",
  ])("treats contradictory %s as no refundable determination", (state) => {
    const data = input();
    if (state === "case") data.caseCode = "OTHER";
    if (state === "charge") data.chargedCents = 3000;
    if (state === "source") data.groups[2].source = "RIDER_PHONE";
    if (state === "trip status") data.tripStatus = "CANCELLED_BY_DRIVER";
    if (state === "duplicate group")
      data.groups.push(structuredClone(data.groups[0]));
    const receipt = data.groups[1].latest.payload,
      audit = data.groups[2].latest.payload;
    if (state === "quote identity" && receipt.type === "FARE_RECEIPT")
      receipt.quoteId = "different";
    if (state === "audit timing" && audit.type === "FARE_ADJUSTMENT_RECORD")
      audit.reviewedAt = "2026-10-14T00:00:00Z";
    const result = evaluateFare(data, policy);
    expect(result.sufficiency.state).toBe("CONTRADICTORY_EVIDENCE");
    expect(result.evaluation).toMatchObject({
      outcome: "INCONCLUSIVE",
      refundCents: 0,
      matchedRuleId: null,
    });
  });
  it("rejects fractional/negative/overflow cents, unknown fields, duplicate extras and invalid totals", () => {
    for (const chargedCents of [-1, 2900.5, Number.MAX_SAFE_INTEGER])
      expect(
        fareEvidenceSchema.safeParse({ ...RT_002_RECEIPT, chargedCents })
          .success,
      ).toBe(false);
    expect(
      fareEvidenceSchema.safeParse({ ...RT_002_QUOTE, quotedCents: 0 }).success,
    ).toBe(false);
    expect(
      fareEvidenceSchema.safeParse({ ...RT_002_QUOTE, hiddenOverride: true })
        .success,
    ).toBe(false);
    expect(
      fareEvidenceSchema.safeParse({
        ...RT_002_RECEIPT,
        extras: [RT_002_RECEIPT.extras[0], RT_002_RECEIPT.extras[0]],
      }).success,
    ).toBe(false);
    expect(
      fareEvidenceSchema.safeParse({ ...RT_002_RECEIPT, chargedCents: 2901 })
        .success,
    ).toBe(false);
  });
  it("rejects unknown policy conditions, fixed refund overrides and wrong policy codes", () => {
    const unknown = structuredClone(FARE_POLICY_RULES) as any;
    unknown.rules[0].when.ignoredCondition = true;
    expect(() =>
      evaluateFare(input(), { ...policy, rules: unknown }),
    ).toThrow();
    const override = structuredClone(FARE_POLICY_RULES) as any;
    override.rules[0].then.refundCents = 600;
    expect(() =>
      evaluateFare(input(), { ...policy, rules: override }),
    ).toThrow();
    expect(() =>
      evaluateFare(input(), { ...policy, code: "CANCELLATION_FEE_SG" }),
    ).toThrow("category_policy_mismatch");
  });
  it("escalates safely if no supported policy rule matches", () => {
    const rules = {
      ...FARE_POLICY_RULES,
      rules: FARE_POLICY_RULES.rules.filter(
        (r) => r.when.excessCharge === "ZERO",
      ),
    };
    expect(
      evaluateFare(input(), { ...policy, rules }).evaluation,
    ).toMatchObject({ outcome: "ESCALATE_FOR_REVIEW", refundCents: 0 });
  });
  it("adds a separate synthetic case idempotently without touching RT-001", async () => {
    const original = await prisma.dispute.findUniqueOrThrow({
      where: { caseCode: "RT-001" },
      include: {
        trip: true,
        evidence: true,
        statements: true,
        findings: true,
        recommendations: true,
        audit: true,
      },
    });
    const added = await addFareCase(prisma, "FARE-CHECKPOINT-A");
    const again = await addFareCase(prisma, "FARE-CHECKPOINT-A");
    expect(again.id).toBe(added.id);
    expect(added.category).toBe("FARE_DISCREPANCY");
    expect(
      await prisma.evidence.count({ where: { disputeId: added.id } }),
    ).toBe(3);
    expect(
      await prisma.dispute.findUniqueOrThrow({
        where: { caseCode: "RT-001" },
        include: {
          trip: true,
          evidence: true,
          statements: true,
          findings: true,
          recommendations: true,
          audit: true,
        },
      }),
    ).toEqual(original);
  });
});
