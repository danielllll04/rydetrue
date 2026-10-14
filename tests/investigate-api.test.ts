/**
 * Investigation API endpoint tests.
 *
 * Tests the POST /api/cases/[id]/investigate endpoint via the production
 * route handler. In test mode, getProvider() returns a MockProvider
 * automatically (VITEST=true, no RYDETRUE_LLM_API_KEY).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/db";
import { POST as investigateCase } from "../src/app/api/cases/[id]/investigate/route";
import { POST as submitEvidence } from "../src/app/api/cases/[id]/evidence/route";
import { RT_001_STAGE_1_EVIDENCE_BY_GROUP, RT_001_STAGE_2_GEOTAG } from "../src/lib/cases";
import { hashPayload } from "../src/lib/evidence";

class MockNextRequest {
  url: string;
  method: string;
  body: unknown;
  constructor(url: string, init: { method?: string; body?: unknown } = {}) {
    this.url = url;
    this.method = init.method ?? "GET";
    this.body = init.body;
  }
  async json() {
    return this.body;
  }
}

async function resetRT001ToStage1() {
  const dispute = await prisma.dispute.findFirst({
    where: { caseCode: "RT-001" },
  });
  if (!dispute) throw new Error("RT-001 not seeded.");
  await prisma.auditEvent.deleteMany({ where: { disputeId: dispute.id } });
  await prisma.recommendation.deleteMany({ where: { disputeId: dispute.id } });
  await prisma.agentFinding.deleteMany({ where: { disputeId: dispute.id } });
  await prisma.evidence.deleteMany({ where: { disputeId: dispute.id } });
  await prisma.dispute.update({
    where: { id: dispute.id },
    data: { status: "OPEN" },
  });
  for (const [refGroup, e] of Object.entries(RT_001_STAGE_1_EVIDENCE_BY_GROUP)) {
    const payload = e.payload;
    const hash = hashPayload(payload);
    await prisma.evidence.create({
      data: {
        disputeId: dispute.id,
        type: e.type,
        source: e.source,
        refGroup,
        version: 1,
        hash,
        capturedAt: new Date(e.capturedAt),
        payload: JSON.stringify(payload),
        notes: `Stage 1 fixture (${refGroup}) — reset by investigate API test`,
      },
    });
  }
  await prisma.auditEvent.create({
    data: {
      disputeId: dispute.id,
      actor: "system",
      action: "OPEN",
      payload: JSON.stringify({ reason: "Test reset.", openedAt: dispute.openedAt.toISOString() }),
    },
  });
}

async function json(res: Response) {
  return res.json();
}

describe("Investigation API — Stage 1 (insufficient evidence)", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("POST /investigate returns 200 with INSUFFICIENT_EVIDENCE", async () => {
    const res = await investigateCase(
      new MockNextRequest("http://localhost/api/cases/RT-001/investigate", {
        method: "POST",
        body: { policyCode: "CANCELLATION_FEE_SG", actor: "system:api-test" },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.investigationId).toBeDefined();
    expect(data.status).toBe("COMPLETED");
    expect(data.agents.riderAdvocate.status).toBe("COMPLETED");
    expect(data.agents.driverAdvocate.status).toBe("COMPLETED");
    expect(data.agents.neutralResolution.status).toBe("COMPLETED");
    expect(data.sufficiency.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(data.policyRecommendation.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(data.humanApprovalRequired).toBe(false);
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("Investigation API — Stage 2 (REFUND_FULL)", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
    // Submit Stage 2 geotag via the evidence API.
    await submitEvidence(
      new MockNextRequest("http://localhost/api/cases/RT-001/evidence", {
        method: "POST",
        body: {
          type: RT_001_STAGE_2_GEOTAG.type,
          source: RT_001_STAGE_2_GEOTAG.source,
          refGroup: RT_001_STAGE_2_GEOTAG.refGroup,
          payload: RT_001_STAGE_2_GEOTAG.payload,
          capturedAt: RT_001_STAGE_2_GEOTAG.capturedAt,
          notes: "Stage 2 geotag (API test)",
          actor: "system:stage2-api-test",
        },
      }) as never,
      { params: { id: "RT-001" } }
    );
  });

  it("POST /investigate returns 200 with REFUND_FULL and PENDING approval", async () => {
    const res = await investigateCase(
      new MockNextRequest("http://localhost/api/cases/RT-001/investigate", {
        method: "POST",
        body: { policyCode: "CANCELLATION_FEE_SG", actor: "system:api-test-stage2" },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.investigationId).toBeDefined();
    expect(data.status).toBe("COMPLETED");
    expect(data.sufficiency.state).toBe("SUFFICIENT");
    expect(data.policyRecommendation.outcome).toBe("REFUND_FULL");
    expect(data.policyRecommendation.refundCents).toBe(500);
    expect(data.policyRecommendation.approvalState).toBe("PENDING");
    expect(data.humanApprovalRequired).toBe(true);
    // Evidence snapshot should include the geotag.
    const refGroups = data.evidenceSnapshot.map((e: { refGroup: string }) => e.refGroup);
    expect(refGroups).toContain("third-party-geotag");
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("Investigation API — error handling", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("POST /investigate with bad body returns 400", async () => {
    const res = await investigateCase(
      new MockNextRequest("http://localhost/api/cases/RT-001/investigate", {
        method: "POST",
        body: { policyCode: "" },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(400);
  });

  it("POST /investigate for unknown case returns 422 (FAILED)", async () => {
    const res = await investigateCase(
      new MockNextRequest("http://localhost/api/cases/UNKNOWN/investigate", {
        method: "POST",
        body: { policyCode: "CANCELLATION_FEE_SG" },
      }) as never,
      { params: { id: "UNKNOWN" } }
    );
    expect(res.status).toBe(422);
    const data = await json(res);
    expect(data.status).toBe("FAILED");
    expect(data.escalationReason).toContain("Case not found");
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});
