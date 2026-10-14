/**
 * End-to-end test for the two-stage RT-001 flow:
 *
 * STAGE 1: evaluate with insufficient evidence → INSUFFICIENT_EVIDENCE
 * STAGE 2: submit new geotag → evaluate → REFUND_FULL → approve
 *
 * Also tests: invalid evidence rejection, tamper detection,
 * contradictory evidence, recommendation history preservation.
 *
 * Uses the production route handlers directly with synthetic NextRequest.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/db";
import { GET as listCases } from "../src/app/api/cases/route";
import { GET as getCase } from "../src/app/api/cases/[id]/route";
import { POST as evaluateCase } from "../src/app/api/cases/[id]/evaluate/route";
import { POST as submitEvidence } from "../src/app/api/cases/[id]/evidence/route";
import { POST as approveRec } from "../src/app/api/cases/[id]/recommendations/[recId]/approve/route";
import { RT_001_STAGE_2_GEOTAG, RT_001_STAGE_1_EVIDENCE_BY_GROUP } from "../src/lib/cases";
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

/**
 * Full reset of RT-001 to Stage 1 state.
 * Deletes ALL evidence (including tampered), recommendations, and audit events,
 * then re-creates Stage 1 evidence from fixtures. This ensures a clean state
 * even after tamper tests corrupt evidence.
 */
async function resetRT001ToStage1() {
  const dispute = await prisma.dispute.findFirst({
    where: { caseCode: "RT-001" },
  });
  if (!dispute) {
    throw new Error("RT-001 not seeded. Run `npm run db:reset` first.");
  }
  // Wipe everything.
  await prisma.auditEvent.deleteMany({
    where: { disputeId: dispute.id },
  });
  await prisma.recommendation.deleteMany({
    where: { disputeId: dispute.id },
  });
  await prisma.evidence.deleteMany({
    where: { disputeId: dispute.id },
  });
  await prisma.dispute.update({
    where: { id: dispute.id },
    data: { status: "OPEN" },
  });
  // Re-create Stage 1 evidence from fixtures.
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
        notes: `Stage 1 fixture (${refGroup}) — reset by test suite`,
      },
    });
  }
  // Re-create the OPEN audit event.
  await prisma.auditEvent.create({
    data: {
      disputeId: dispute.id,
      actor: "system",
      action: "OPEN",
      payload: JSON.stringify({
        reason: "Test reset to Stage 1.",
        openedAt: dispute.openedAt.toISOString(),
      }),
    },
  });
}

async function json(res: Response) {
  return res.json();
}

describe("API routes — basic retrieval", () => {
  beforeAll(async () => {
    const count = await prisma.dispute.count({ where: { caseCode: "RT-001" } });
    if (count === 0) {
      throw new Error("RT-001 not seeded. Run `npm run db:reset`.");
    }
    await resetRT001ToStage1();
  });

  it("GET /api/cases lists RT-001", async () => {
    const res = await listCases(new MockNextRequest("http://localhost/api/cases") as never);
    expect(res.status).toBe(200);
    const data = await json(res);
    const codes = data.cases.map((c: { caseCode: string }) => c.caseCode);
    expect(codes).toContain("RT-001");
  });

  it("GET /api/cases/RT-001 returns the full case with verified hashes", async () => {
    const res = await getCase(
      new MockNextRequest("http://localhost/api/cases/RT-001") as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.caseCode).toBe("RT-001");
    expect(data.evidence.groups.length).toBeGreaterThan(0);
    for (const r of data.evidence.integrity) {
      expect(r.hashMatches).toBe(true);
    }
    const roles = data.statements.map((s: { role: string }) => s.role);
    expect(roles).toContain("RIDER");
    expect(roles).toContain("DRIVER");
  });

  it("GET /api/cases/UNKNOWN returns 404", async () => {
    const res = await getCase(
      new MockNextRequest("http://localhost/api/cases/UNKNOWN") as never,
      { params: { id: "UNKNOWN" } }
    );
    expect(res.status).toBe(404);
  });
});

describe("API routes — two-stage re-evaluation flow", () => {
  let stage1RecId: string | null = null;
  let stage2RecId: string | null = null;

  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("STAGE 1: evaluate with insufficient evidence → INSUFFICIENT_EVIDENCE", async () => {
    const res = await evaluateCase(
      new MockNextRequest("http://localhost/api/cases/RT-001/evaluate", {
        method: "POST",
        body: { policyCode: "CANCELLATION_FEE_SG", actor: "system:stage1" },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.recommendation.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(data.recommendation.sufficiencyState).toBe("INSUFFICIENT_EVIDENCE");
    expect(data.recommendation.refundCents).toBe(0);
    expect(data.recommendation.matchedRuleId).toBeNull();
    expect(data.recommendation.approvalState).toBe("NOT_APPLICABLE");
    expect(data.sufficiency.missingRequirements).toContain("THIRD_PARTY_GEOTAG");
    stage1RecId = data.recommendation.id;
    // Must not accuse either party of dishonesty.
    expect(data.recommendation.rationale.toLowerCase()).not.toContain("dishonest");
    expect(data.recommendation.rationale.toLowerCase()).not.toContain("lying");
  });

  it("STAGE 2a: submit new THIRD_PARTY_GEOTAG evidence → 201", async () => {
    const res = await submitEvidence(
      new MockNextRequest("http://localhost/api/cases/RT-001/evidence", {
        method: "POST",
        body: {
          type: RT_001_STAGE_2_GEOTAG.type,
          source: RT_001_STAGE_2_GEOTAG.source,
          refGroup: RT_001_STAGE_2_GEOTAG.refGroup,
          payload: RT_001_STAGE_2_GEOTAG.payload,
          capturedAt: RT_001_STAGE_2_GEOTAG.capturedAt,
          notes: "Stage 2: airport ground operations geotag (synthetic)",
          actor: "system:stage2-submit",
        },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(201);
    const data = await json(res);
    expect(data.evidence.refGroup).toBe("third-party-geotag");
    expect(data.evidence.version).toBe(1);
    expect(data.evidence.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("STAGE 2b: re-evaluate with new evidence → REFUND_FULL (PENDING approval)", async () => {
    const res = await evaluateCase(
      new MockNextRequest("http://localhost/api/cases/RT-001/evaluate", {
        method: "POST",
        body: { policyCode: "CANCELLATION_FEE_SG", actor: "system:stage2" },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.recommendation.outcome).toBe("REFUND_FULL");
    expect(data.recommendation.refundCents).toBe(500);
    expect(data.recommendation.sufficiencyState).toBe("SUFFICIENT");
    expect(data.recommendation.matchedRuleId).toBe("SG-CXL-R1");
    expect(data.recommendation.approvalState).toBe("PENDING");
    expect(data.recommendation.supersededRecommendationId).toBe(stage1RecId);
    expect(data.recommendation.evidenceSnapshot.length).toBeGreaterThan(0);
    // The evidence snapshot should include the third-party-geotag.
    const snapshotRefGroups = data.recommendation.evidenceSnapshot.map(
      (s: { refGroup: string }) => s.refGroup
    );
    expect(snapshotRefGroups).toContain("third-party-geotag");
    stage2RecId = data.recommendation.id;
  });

  it("STAGE 2c: approve the recommendation → APPROVED (simulated)", async () => {
    const res = await approveRec(
      new MockNextRequest(
        `http://localhost/api/cases/RT-001/recommendations/${stage2RecId}/approve`,
        {
          method: "POST",
          body: {
            decision: "APPROVED",
            actor: "reviewer:test",
            notes: "Approved by test reviewer (simulated refund).",
          },
        }
      ) as never,
      { params: { id: "RT-001", recId: stage2RecId! } }
    );
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.recommendation.approvalState).toBe("APPROVED");
    expect(data.recommendation.approvedBy).toBe("reviewer:test");
    expect(data.recommendation.simulated).toBe(true);
  });

  it("case detail shows both recommendations in history (previous preserved)", async () => {
    const res = await getCase(
      new MockNextRequest("http://localhost/api/cases/RT-001") as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.recommendationHistory.length).toBe(2);
    // Stage 1 recommendation should be superseded.
    const stage1 = data.recommendationHistory.find(
      (r: { id: string }) => r.id === stage1RecId
    );
    expect(stage1).toBeDefined();
    expect(stage1.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(stage1.isCurrent).toBe(false);
    expect(stage1.supersededById).not.toBeNull();
    // Stage 2 recommendation should be current.
    const stage2 = data.recommendationHistory.find(
      (r: { id: string }) => r.id === stage2RecId
    );
    expect(stage2).toBeDefined();
    expect(stage2.outcome).toBe("REFUND_FULL");
    expect(stage2.isCurrent).toBe(true);
    expect(stage2.supersededById).toBeNull();
    // Both should have evidence snapshots.
    expect(stage1.evidenceSnapshot.length).toBeGreaterThan(0);
    expect(stage2.evidenceSnapshot.length).toBeGreaterThan(0);
    // Stage 1 snapshot should NOT include the geotag (it wasn't available yet).
    const stage1Groups = stage1.evidenceSnapshot.map((s: { refGroup: string }) => s.refGroup);
    expect(stage1Groups).not.toContain("third-party-geotag");
    // Stage 2 snapshot SHOULD include the geotag.
    const stage2Groups = stage2.evidenceSnapshot.map((s: { refGroup: string }) => s.refGroup);
    expect(stage2Groups).toContain("third-party-geotag");
  });

  it("audit log shows OPEN, EVALUATE (stage 1), SUBMIT_EVIDENCE, EVALUATE (stage 2), APPROVE", async () => {
    const res = await getCase(
      new MockNextRequest("http://localhost/api/cases/RT-001") as never,
      { params: { id: "RT-001" } }
    );
    const data = await json(res);
    const actions = data.audit.map((a: { action: string }) => a.action);
    expect(actions).toContain("OPEN");
    expect(actions.filter((a: string) => a === "EVALUATE").length).toBe(2);
    expect(actions).toContain("SUBMIT_EVIDENCE");
    expect(actions).toContain("APPROVE");
  });
});

describe("API routes — error handling", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("POST /evaluate with bad body returns 400", async () => {
    const res = await evaluateCase(
      new MockNextRequest("http://localhost/api/cases/RT-001/evaluate", {
        method: "POST",
        body: { policyCode: "" },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(400);
  });

  it("POST /evaluate for unknown case returns 404", async () => {
    const res = await evaluateCase(
      new MockNextRequest("http://localhost/api/cases/UNKNOWN/evaluate", {
        method: "POST",
        body: { policyCode: "CANCELLATION_FEE_SG" },
      }) as never,
      { params: { id: "UNKNOWN" } }
    );
    expect(res.status).toBe(404);
  });

  it("POST /evaluate with unknown policy returns 404", async () => {
    const res = await evaluateCase(
      new MockNextRequest("http://localhost/api/cases/RT-001/evaluate", {
        method: "POST",
        body: { policyCode: "DOES_NOT_EXIST" },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(404);
  });

  it("POST /evidence with invalid payload returns 400", async () => {
    const res = await submitEvidence(
      new MockNextRequest("http://localhost/api/cases/RT-001/evidence", {
        method: "POST",
        body: {
          type: "THIRD_PARTY_GEOTAG",
          source: "THIRD_PARTY",
          refGroup: "test-invalid",
          // Missing required fields in payload
          payload: { type: "THIRD_PARTY_GEOTAG", providerName: "test" },
          capturedAt: "2026-10-12T14:33:20.000Z",
        },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(400);
  });

  it("POST /evidence for unknown case returns 404", async () => {
    const res = await submitEvidence(
      new MockNextRequest("http://localhost/api/cases/UNKNOWN/evidence", {
        method: "POST",
        body: {
          type: "GPS_PING",
          source: "RIDER_PHONE",
          refGroup: "test",
          payload: {
            type: "GPS_PING",
            trail: [{ at: "2026-10-12T14:32:00.000Z", lat: 1.35, lng: 103.98 }],
          },
          capturedAt: "2026-10-12T14:32:00.000Z",
        },
      }) as never,
      { params: { id: "UNKNOWN" } }
    );
    expect(res.status).toBe(404);
  });

  it("POST /approve for unknown recommendation returns 404", async () => {
    const res = await approveRec(
      new MockNextRequest(
        "http://localhost/api/cases/RT-001/recommendations/fake-id/approve",
        {
          method: "POST",
          body: { decision: "APPROVED", actor: "test" },
        }
      ) as never,
      { params: { id: "RT-001", recId: "fake-id" } }
    );
    expect(res.status).toBe(404);
  });
});

describe("API routes — evidence tamper detection", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("POST /evaluate returns 422 when evidence hash is tampered with", async () => {
    // Directly corrupt a payload in the DB (don't update the hash).
    const dispute = await prisma.dispute.findFirst({
      where: { caseCode: "RT-001" },
      include: { evidence: true },
    });
    const evidence = dispute!.evidence[0];
    const originalPayload = JSON.parse(evidence.payload);
    // Tamper: change a coordinate.
    if (originalPayload.trail) {
      originalPayload.trail[0].lat = 9.99999;
    } else {
      originalPayload.tampered = true;
    }
    await prisma.evidence.update({
      where: { id: evidence.id },
      data: { payload: JSON.stringify(originalPayload) },
    });

    const res = await evaluateCase(
      new MockNextRequest("http://localhost/api/cases/RT-001/evaluate", {
        method: "POST",
        body: { policyCode: "CANCELLATION_FEE_SG", actor: "system:tamper-test" },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(422);
    const data = await json(res);
    expect(data.error).toBe("evidence_integrity_failed");
    expect(data.corruptEvidenceIds.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    // Reset to clean state for subsequent test suites.
    await resetRT001ToStage1();
  });
});

describe("API routes — contradictory evidence cannot trigger unjustified refund", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("submitting a contradictory geotag (far from GPS) → INCONCLUSIVE (no refund)", async () => {
    // Submit a geotag that contradicts the driver GPS trail.
    const contradictoryGeotag = {
      type: "THIRD_PARTY_GEOTAG" as const,
      source: "THIRD_PARTY" as const,
      refGroup: "third-party-geotag",
      capturedAt: "2026-10-12T14:33:20.000Z",
      payload: {
        type: "THIRD_PARTY_GEOTAG" as const,
        providerName: "Contradictory Test Source",
        designatedEntrance: { lat: 1.35457, lng: 103.98725 },
        // Place driver location very far from GPS trail (~700m away)
        driverActualLocation: { lat: 1.36000, lng: 103.99000 },
        capturedAt: "2026-10-12T14:33:20.000Z",
      },
    };

    const submitRes = await submitEvidence(
      new MockNextRequest("http://localhost/api/cases/RT-001/evidence", {
        method: "POST",
        body: {
          ...contradictoryGeotag,
          actor: "system:contradiction-test",
        },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(submitRes.status).toBe(201);

    const evalRes = await evaluateCase(
      new MockNextRequest("http://localhost/api/cases/RT-001/evaluate", {
        method: "POST",
        body: { policyCode: "CANCELLATION_FEE_SG", actor: "system:contradiction-eval" },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(evalRes.status).toBe(200);
    const data = await json(evalRes);
    // Sufficiency should be CONTRADICTORY_EVIDENCE → outcome INCONCLUSIVE.
    expect(data.recommendation.sufficiencyState).toBe("CONTRADICTORY_EVIDENCE");
    expect(data.recommendation.outcome).toBe("INCONCLUSIVE");
    expect(data.recommendation.refundCents).toBe(0);
    expect(data.recommendation.matchedRuleId).toBeNull();
  });

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("API routes — policy versioning", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("evaluate with asOf=2026-03-15 selects v1 (legacy policy)", async () => {
    const res = await evaluateCase(
      new MockNextRequest("http://localhost/api/cases/RT-001/evaluate", {
        method: "POST",
        body: {
          policyCode: "CANCELLATION_FEE_SG",
          asOf: "2026-03-15T12:00:00.000Z",
          actor: "system:versioning-test",
        },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(200);
    const data = await json(res);
    // v1 selected — confirmed by policyVersion=1.
    expect(data.recommendation.policyVersion).toBe(1);
    // Stage 1 has no geotag → sufficiency = INSUFFICIENT_EVIDENCE regardless
    // of policy version. The sufficiency gate runs before policy rules.
    expect(data.recommendation.sufficiencyState).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("evaluate with current date selects v2", async () => {
    const res = await evaluateCase(
      new MockNextRequest("http://localhost/api/cases/RT-001/evaluate", {
        method: "POST",
        body: {
          policyCode: "CANCELLATION_FEE_SG",
          actor: "system:versioning-test-v2",
        },
      }) as never,
      { params: { id: "RT-001" } }
    );
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.recommendation.policyVersion).toBe(2);
  });

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});