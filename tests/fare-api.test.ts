import { describe, it, expect, vi } from "vitest";
import { prisma } from "../src/lib/db";
import { addFareCase } from "../src/lib/fixtures/add-fare-case";
import { RT_002_STAGE_2 } from "../src/lib/fare-case";
import { FARE_POLICY_CODE } from "../src/lib/fare-policy";
import { hashPayload } from "../src/lib/evidence";
import { fareAdjustmentSchema } from "../src/lib/fare-contracts";
import {
  advocateFindingSchema,
  neutralResolutionSchema,
} from "../src/lib/agents/schemas";
import { MockProvider } from "../src/lib/agents/providers/mock";
import { investigateCase } from "../src/lib/agents/orchestrator";
import { POST as evaluate } from "../src/app/api/cases/[id]/evaluate/route";
import { POST as evidence } from "../src/app/api/cases/[id]/evidence/route";
import { POST as approve } from "../src/app/api/cases/[id]/recommendations/[recId]/approve/route";
import { POST as investigate } from "../src/app/api/cases/[id]/investigate/route";
let sequence = 0;
const request = (body: unknown) => ({ json: async () => body }) as never;
async function fixture() {
  const code = `FARE-API-${++sequence}`;
  await addFareCase(prisma, code);
  return code;
}
const pricing = (code: string) => ({
  ...structuredClone(RT_002_STAGE_2),
  payload: {
    ...fareAdjustmentSchema.parse(RT_002_STAGE_2.payload),
    caseCode: code,
  },
  actor: "test:pricing",
});
const submit = (code: string, body = pricing(code)) =>
  evidence(request(body), { params: { id: code } });
const evaluateCase = (code: string, policyCode = FARE_POLICY_CODE) =>
  evaluate(request({ policyCode, actor: "test" }), { params: { id: code } });
const decide = (code: string, recId: string, decision = "APPROVED") =>
  approve(request({ decision, actor: "test:human" }), {
    params: { id: code, recId },
  });
async function ready() {
  const code = await fixture();
  expect((await submit(code)).status).toBe(201);
  const result = await (await evaluateCase(code)).json();
  return { code, rec: result.recommendation };
}

describe("fare API and independent agent workflow", () => {
  it("runs both stages with three validated agents, computed refund and preserved history", async () => {
    const code = await fixture();
    const provider = new MockProvider();
    const calls = vi.spyOn(provider, "chat");
    const first = await investigateCase(
      code,
      provider,
      FARE_POLICY_CODE,
      "test",
    );
    expect(first.status).toBe("COMPLETED");
    expect(first.policyRecommendation).toMatchObject({
      outcome: "INSUFFICIENT_EVIDENCE",
      refundCents: 0,
      approvalState: "NOT_APPLICABLE",
    });
    expect(first.sufficiency.missingRequirements).toContain(
      "FARE_ADJUSTMENT_RECORD",
    );
    expect((await submit(code)).status).toBe(201);
    const second = await investigateCase(
      code,
      provider,
      FARE_POLICY_CODE,
      "test",
    );
    expect(second.status).toBe("COMPLETED");
    expect(second.policyRecommendation).toMatchObject({
      outcome: "REFUND_PARTIAL",
      refundCents: 600,
      approvalState: "PENDING",
    });
    const ids = new Set(second.evidenceSnapshot.map((e) => e.evidenceId));
    for (const agent of Object.values(second.agents)) {
      expect(agent.status).toBe("COMPLETED");
      expect(agent.finding).not.toBeNull();
    }
    for (const advocate of [
      second.agents.riderAdvocate,
      second.agents.driverAdvocate,
    ]) {
      const finding = advocateFindingSchema.parse(advocate.finding);
      expect(finding.summary).not.toMatch(/cancellation|entrance|geotag/i);
      for (const point of [
        ...finding.supportingPoints,
        ...finding.weakeningPoints,
      ])
        for (const id of point.citedEvidenceIds) expect(ids.has(id)).toBe(true);
    }
    for (const id of neutralResolutionSchema.parse(
      second.agents.neutralResolution.finding,
    ).citedEvidenceIds)
      expect(ids.has(id)).toBe(true);
    for (const [messages] of calls.mock.calls) {
      if (messages[0].content.includes("NEUTRAL RESOLUTION")) continue;
      expect(
        messages
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .join(" "),
      ).not.toContain("ADVOCATE FINDING");
    }
    expect(
      (await decide(code, second.policyRecommendation.recommendationId!))
        .status,
    ).toBe(200);
    const dispute = await prisma.dispute.findUniqueOrThrow({
      where: { caseCode: code },
      include: { recommendations: true, audit: true, findings: true },
    });
    expect(dispute.recommendations).toHaveLength(2);
    expect(dispute.findings).toHaveLength(6);
    expect(
      dispute.recommendations.find(
        (r) => r.id === first.policyRecommendation.recommendationId,
      )?.supersededById,
    ).toBe(second.policyRecommendation.recommendationId);
    expect(dispute.audit.some((a) => a.action === "APPROVE")).toBe(true);
  });
  it("integrated investigate route uses isolated mock mode for fare", async () => {
    const code = await fixture();
    const network = vi.spyOn(globalThis, "fetch");
    const response = await investigate(
      request({ policyCode: FARE_POLICY_CODE, actor: "test" }),
      { params: { id: code } },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("COMPLETED");
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
  });
  it("all permitted extras produce NO_REFUND without approval eligibility", async () => {
    const code = await fixture(),
      body = pricing(code);
    body.payload.extras[1] = {
      ...body.payload.extras[1],
      permitted: true,
      permittedCents: 600,
    };
    expect((await submit(code, body)).status).toBe(201);
    const { recommendation } = await (await evaluateCase(code)).json();
    expect((await investigateCase(code, new MockProvider(), FARE_POLICY_CODE, "test")).status).toBe("COMPLETED");
    expect(recommendation).toMatchObject({
      outcome: "NO_REFUND",
      refundCents: 0,
      approvalState: "NOT_APPLICABLE",
    });
    expect((await decide(code, recommendation.id)).status).toBe(409);
  });
  it("receipt changes recalculate the excess rather than fixing 600 cents", async () => {
    const code = await fixture();
    const dispute = await prisma.dispute.findUniqueOrThrow({
      where: { caseCode: code },
      include: { evidence: true },
    });
    const record = dispute.evidence.find((e) => e.type === "FARE_RECEIPT")!;
    const payload = JSON.parse(record.payload);
    payload.chargedCents = 2700;
    payload.extras[1].amountCents = 400;
    await prisma.evidence.update({
      where: { id: record.id },
      data: { payload: JSON.stringify(payload), hash: hashPayload(payload) },
    });
    await prisma.trip.update({
      where: { id: dispute.tripId },
      data: { fareAmountCents: 2700 },
    });
    await submit(code);
    expect(
      (await (await evaluateCase(code)).json()).recommendation.refundCents,
    ).toBe(400);
  });
  it("contradictory audit cannot produce a refund", async () => {
    const code = await fixture(),
      body = pricing(code);
    body.payload.receiptId = "different-receipt";
    await submit(code, body);
    expect(
      (await (await evaluateCase(code)).json()).recommendation,
    ).toMatchObject({
      outcome: "INCONCLUSIVE",
      sufficiencyState: "CONTRADICTORY_EVIDENCE",
      refundCents: 0,
    });
  });
  it.each(["CANCELLATION_FEE_SG", "FARE_RECONCILIATION_SG"])(
    "rejects category-policy mismatch %s",
    async (policy) => {
      const code = policy === FARE_POLICY_CODE ? "RT-001" : await fixture();
      expect((await evaluateCase(code, policy)).status).toBe(422);
      const provider = new MockProvider();
      expect(
        (await investigateCase(code, provider, policy, "test")).status,
      ).toBe("FAILED");
      expect(provider.callCount_value).toBe(0);
    },
  );
  it("rejects unknown policy conditions before inference or recommendation", async () => {
    const code = await fixture();
    const original = await prisma.policyVersion.findFirstOrThrow({
      where: { code: FARE_POLICY_CODE },
    });
    const rules = JSON.parse(original.rules);
    rules.rules[0].when.routeLength = "ignore";
    await prisma.policyVersion.update({
      where: { id: original.id },
      data: { rules: JSON.stringify(rules) },
    });
    try {
      expect((await evaluateCase(code)).status).toBe(422);
    } finally {
      await prisma.policyVersion.update({
        where: { id: original.id },
        data: { rules: original.rules },
      });
    }
  });
  it.each(["wrong-case", "wrong-source", "wrong-type", "wrong-category"])(
    "rejects scoped evidence: %s",
    async (failure) => {
      let code = await fixture();
      const body = pricing(code);
      if (failure === "wrong-case") body.payload.caseCode = "RT-001";
      if (failure === "wrong-source") body.source = "PLATFORM" as never;
      if (failure === "wrong-type") body.type = "FARE_QUOTE" as never;
      if (failure === "wrong-category") code = "RT-001";
      expect((await submit(code, body)).status).toBe(400);
    },
  );
});

describe("atomic review safety for fare recommendations", () => {
  it.each(["APPROVED", "REJECTED"])(
    "blocks %s of a stale snapshot without audit/status mutation",
    async (decision) => {
      const { code, rec } = await ready();
      const before = await prisma.dispute.findUniqueOrThrow({
        where: { caseCode: code },
      });
      await submit(code); // new append-only evidence version, same content still makes snapshot stale
      expect((await decide(code, rec.id, decision)).status).toBe(409);
      expect(
        (
          await prisma.recommendation.findUniqueOrThrow({
            where: { id: rec.id },
          })
        ).approvalState,
      ).toBe("PENDING");
      expect(
        await prisma.auditEvent.count({
          where: {
            disputeId: before.id,
            action: { in: ["APPROVE", "REJECT"] },
          },
        }),
      ).toBe(0);
      expect(
        (await prisma.dispute.findUniqueOrThrow({ where: { caseCode: code } }))
          .status,
      ).toBe(before.status);
    },
  );
  it("blocks superseded pending recommendations", async () => {
    const { code, rec } = await ready();
    await evaluateCase(code);
    expect((await decide(code, rec.id)).status).toBe(409);
  });
  it("blocks a tampered evidence payload", async () => {
    const { code, rec } = await ready();
    const record = await prisma.evidence.findFirstOrThrow({
      where: { dispute: { caseCode: code }, type: "FARE_QUOTE" },
    });
    await prisma.evidence.update({
      where: { id: record.id },
      data: { payload: "{}" },
    });
    expect((await decide(code, rec.id)).status).toBe(409);
  });
  it("blocks forged pending insufficient recommendations", async () => {
    const code = await fixture();
    const { recommendation } = await (await evaluateCase(code)).json();
    await prisma.recommendation.update({
      where: { id: recommendation.id },
      data: { approvalState: "PENDING", refundCents: 600 },
    });
    expect((await decide(code, recommendation.id)).status).toBe(409);
  });
  it("blocks changed computed amounts and incomplete snapshots", async () => {
    const { code, rec } = await ready();
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { refundCents: 601 },
    });
    expect((await decide(code, rec.id)).status).toBe(409);
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { refundCents: 600, evidenceSnapshot: "[]" },
    });
    expect((await decide(code, rec.id)).status).toBe(409);
  });
  it("permits current eligible rejection and records one simulated audit", async () => {
    const { code, rec } = await ready();
    const response = await decide(code, rec.id, "REJECTED");
    expect(response.status).toBe(200);
    expect((await response.json()).recommendation).toMatchObject({
      approvalState: "REJECTED",
      simulated: true,
    });
    expect((await decide(code, rec.id)).status).toBe(409);
  });
  it("concurrent human decisions cannot both succeed or create two audits", async () => {
    const { code, rec } = await ready();
    const responses = await Promise.all([
      decide(code, rec.id),
      decide(code, rec.id, "REJECTED"),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.auditEvent.count({
        where: {
          dispute: { caseCode: code },
          action: { in: ["APPROVE", "REJECT"] },
        },
      }),
    ).toBe(1);
  });
});
