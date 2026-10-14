/**
 * Agent layer tests — multi-agent investigation with mock provider.
 *
 * Tests:
 *  - Independent agent execution (rider + driver advocates run independently)
 *  - Valid evidence citations in agent findings
 *  - Rejection of fabricated evidence IDs
 *  - Rejection of invalid structured outputs (wrong schema, invalid JSON)
 *  - Provider timeouts and failures → escalation to human review
 *  - Prompt-injection resistance (injected text doesn't change outcome)
 *  - Stage 1: insufficient evidence investigation
 *  - Stage 2: evidence-driven reevaluation investigation
 *  - Snapshot consistency (evidence snapshot matches investigation start)
 *  - Policy outcome cannot be overridden by LLM output
 *  - No unauthorized simulated refund approval
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/db";
import { investigateCase } from "../src/lib/agents/orchestrator";
import { MockProvider } from "../src/lib/agents/providers/mock";
import { RT_001_STAGE_1_EVIDENCE_BY_GROUP, RT_001_STAGE_2_GEOTAG } from "../src/lib/cases";
import { hashPayload } from "../src/lib/evidence";
import type { LLMProvider } from "../src/lib/agents/provider";

/**
 * Reset RT-001 to Stage 1 state — same logic as api.test.ts.
 */
async function resetRT001ToStage1() {
  const dispute = await prisma.dispute.findFirst({
    where: { caseCode: "RT-001" },
  });
  if (!dispute) {
    throw new Error("RT-001 not seeded. Run `npm run db:reset` first.");
  }
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
        notes: `Stage 1 fixture (${refGroup}) — reset by agent test suite`,
      },
    });
  }
  await prisma.auditEvent.create({
    data: {
      disputeId: dispute.id,
      actor: "system",
      action: "OPEN",
      payload: JSON.stringify({
        reason: "Test reset to Stage 1 (agent tests).",
        openedAt: dispute.openedAt.toISOString(),
      }),
    },
  });
}

/** Submit Stage 2 geotag evidence via Prisma (bypassing the API for test isolation). */
async function submitStage2Geotag() {
  const dispute = await prisma.dispute.findFirst({
    where: { caseCode: "RT-001" },
  });
  if (!dispute) throw new Error("RT-001 not found");

  const payload = RT_001_STAGE_2_GEOTAG.payload;
  const hash = hashPayload(payload);
  await prisma.evidence.create({
    data: {
      disputeId: dispute.id,
      type: RT_001_STAGE_2_GEOTAG.type,
      source: RT_001_STAGE_2_GEOTAG.source,
      refGroup: RT_001_STAGE_2_GEOTAG.refGroup,
      version: 1,
      hash,
      capturedAt: new Date(RT_001_STAGE_2_GEOTAG.capturedAt),
      payload: JSON.stringify(payload),
      notes: "Stage 2 fixture — geotag submitted by agent test suite",
    },
  });
}

describe("Agent layer — Stage 1 investigation (insufficient evidence)", () => {
  let provider: LLMProvider;

  beforeAll(async () => {
    await resetRT001ToStage1();
    provider = new MockProvider();
  });

  it("investigation completes with INSUFFICIENT_EVIDENCE", async () => {
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-stage1"
    );

    expect(result.status).toBe("COMPLETED");
    expect(result.agents.riderAdvocate.status).toBe("COMPLETED");
    expect(result.agents.driverAdvocate.status).toBe("COMPLETED");
    expect(result.agents.neutralResolution.status).toBe("COMPLETED");
    expect(result.sufficiency.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.policyRecommendation.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.policyRecommendation.refundCents).toBe(0);
    expect(result.policyRecommendation.approvalState).toBe("NOT_APPLICABLE");
    expect(result.humanApprovalRequired).toBe(false);
  }, 60_000);

  it("rider advocate produced findings with valid evidence IDs", async () => {
    const result = await investigateCase(
      "RT-001",
      new MockProvider(),
      "CANCELLATION_FEE_SG",
      "system:test-stage1-citations"
    );

    const riderFinding = result.agents.riderAdvocate.finding as Record<string, unknown>;
    expect(riderFinding).toBeDefined();
    expect(riderFinding.supportingPoints).toBeDefined();
    expect((riderFinding.supportingPoints as unknown[]).length).toBeGreaterThan(0);

    // All cited IDs must be in the evidence snapshot.
    const snapshotIds = new Set(result.evidenceSnapshot.map((e) => e.evidenceId));
    const supporting = riderFinding.supportingPoints as Array<{
      citedEvidenceIds: string[];
    }>;
    for (const pt of supporting) {
      for (const id of pt.citedEvidenceIds) {
        expect(snapshotIds.has(id)).toBe(true);
      }
    }
  }, 60_000);

  it("both advocates ran independently (separate findings)", async () => {
    const result = await investigateCase(
      "RT-001",
      new MockProvider(),
      "CANCELLATION_FEE_SG",
      "system:test-independent"
    );

    const riderFinding = result.agents.riderAdvocate.finding as Record<string, unknown>;
    const driverFinding = result.agents.driverAdvocate.finding as Record<string, unknown>;

    expect(riderFinding.agentRole).toBe("RIDER_ADVOCATE");
    expect(riderFinding.party).toBe("RIDER");
    expect(driverFinding.agentRole).toBe("DRIVER_ADVOCATE");
    expect(driverFinding.party).toBe("DRIVER");
  }, 60_000);

  it("evidence snapshot has correct entries (Stage 1: 4 groups, no geotag)", async () => {
    const result = await investigateCase(
      "RT-001",
      new MockProvider(),
      "CANCELLATION_FEE_SG",
      "system:test-snapshot"
    );

    const refGroups = result.evidenceSnapshot.map((e) => e.refGroup);
    expect(refGroups).toContain("rider-gps");
    expect(refGroups).toContain("driver-gps");
    expect(refGroups).toContain("trip-chat");
    expect(refGroups).toContain("trip-telemetry");
    expect(refGroups).not.toContain("third-party-geotag");
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("Agent layer — Stage 2 investigation (REFUND_FULL)", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
    await submitStage2Geotag();
  });

  it("investigation completes with REFUND_FULL and PENDING approval", async () => {
    const result = await investigateCase(
      "RT-001",
      new MockProvider(),
      "CANCELLATION_FEE_SG",
      "system:test-stage2"
    );

    expect(result.status).toBe("COMPLETED");
    expect(result.sufficiency.state).toBe("SUFFICIENT");
    expect(result.policyRecommendation.outcome).toBe("REFUND_FULL");
    expect(result.policyRecommendation.refundCents).toBe(500);
    expect(result.policyRecommendation.matchedRuleId).toBe("SG-CXL-R1");
    expect(result.policyRecommendation.approvalState).toBe("PENDING");
    expect(result.humanApprovalRequired).toBe(true);
  }, 60_000);

  it("evidence snapshot includes geotag (Stage 2: 5 groups)", async () => {
    const result = await investigateCase(
      "RT-001",
      new MockProvider(),
      "CANCELLATION_FEE_SG",
      "system:test-snapshot-stage2"
    );

    const refGroups = result.evidenceSnapshot.map((e) => e.refGroup);
    expect(refGroups).toContain("third-party-geotag");
    expect(refGroups.length).toBe(5);
  }, 60_000);

  it("agent findings and recommendation are persisted in the database", async () => {
    const result = await investigateCase(
      "RT-001",
      new MockProvider(),
      "CANCELLATION_FEE_SG",
      "system:test-persistence"
    );

    // Check agent findings persisted.
    const dispute = await prisma.dispute.findFirst({
      where: { caseCode: "RT-001" },
      include: { findings: true, recommendations: true },
    });
    expect(dispute).toBeDefined();

    const riderFindings = dispute!.findings.filter((f) => f.agent === "RIDER_ADVOCATE");
    const driverFindings = dispute!.findings.filter((f) => f.agent === "DRIVER_ADVOCATE");
    const neutralFindings = dispute!.findings.filter((f) => f.agent === "NEUTRAL_RESOLUTION");

    expect(riderFindings.length).toBeGreaterThan(0);
    expect(driverFindings.length).toBeGreaterThan(0);
    expect(neutralFindings.length).toBeGreaterThan(0);

    // Check recommendation persisted.
    const currentRec = dispute!.recommendations.find((r) => r.supersededById === null);
    expect(currentRec).toBeDefined();
    expect(currentRec!.outcome).toBe(result.policyRecommendation.outcome);
  }, 60_000);

  it("audit log contains INVESTIGATE and INVESTIGATION_COMPLETE events", async () => {
    const dispute = await prisma.dispute.findFirst({
      where: { caseCode: "RT-001" },
      include: { audit: { orderBy: { createdAt: "asc" } } },
    });
    expect(dispute).toBeDefined();

    const actions = dispute!.audit.map((a) => a.action);
    expect(actions).toContain("INVESTIGATE");
    expect(actions).toContain("INVESTIGATION_COMPLETE");
  });

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("Agent layer — citation validation (fabricated IDs rejected)", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("agent citing fabricated evidence IDs fails", async () => {
    const provider = new MockProvider({ failMode: "fabricated_ids" });
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-fabricated"
    );

    // The advocate should fail, causing escalation.
    expect(result.agents.riderAdvocate.status).toBe("FAILED");
    expect(result.agents.driverAdvocate.status).toBe("FAILED");
    expect(result.status).toBe("ESCALATED");
    expect(result.escalationReason).toContain("Advocate investigation failed");
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("Agent layer — invalid structured outputs", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("agent returning non-JSON fails", async () => {
    const provider = new MockProvider({ failMode: "invalid_json" });
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-invalid-json"
    );

    expect(result.agents.riderAdvocate.status).toBe("FAILED");
    expect(result.status).toBe("ESCALATED");
  }, 60_000);

  it("agent returning wrong schema fails", async () => {
    const provider = new MockProvider({ failMode: "wrong_schema" });
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-wrong-schema"
    );

    expect(result.agents.riderAdvocate.status).toBe("FAILED");
    expect(result.status).toBe("ESCALATED");
  }, 60_000);

  it("agent returning empty response fails", async () => {
    const provider = new MockProvider({ failMode: "empty_response" });
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-empty"
    );

    expect(result.agents.riderAdvocate.status).toBe("FAILED");
    expect(result.status).toBe("ESCALATED");
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("Agent layer — provider failures → human review escalation", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("provider timeout → agents escalated", async () => {
    const provider = new MockProvider({ failMode: "timeout" });
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-timeout"
    );

    expect(result.agents.riderAdvocate.status).toBe("ESCALATED");
    expect(result.agents.driverAdvocate.status).toBe("ESCALATED");
    expect(result.status).toBe("ESCALATED");
    expect(result.escalationReason).toContain("Provider timeout");
  }, 60_000);

  it("provider error → agents escalated", async () => {
    const provider = new MockProvider({ failMode: "error" });
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-error"
    );

    expect(result.agents.riderAdvocate.status).toBe("ESCALATED");
    expect(result.status).toBe("ESCALATED");
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("Agent layer — prompt-injection resistance", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("agent output containing injection text does not change policy outcome", async () => {
    // The mock provider's "prompt_injection" fail mode returns a finding
    // whose summary contains injection text trying to approve a refund.
    const provider = new MockProvider({ failMode: "prompt_injection" });
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-injection"
    );

    // The advocate should complete (the finding is valid JSON with valid schema),
    // but the injection text in the summary should NOT affect the policy outcome.
    expect(result.agents.riderAdvocate.status).toBe("COMPLETED");

    // Policy outcome is INSUFFICIENT_EVIDENCE (Stage 1 has no geotag).
    expect(result.policyRecommendation.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.policyRecommendation.refundCents).toBe(0);
    expect(result.humanApprovalRequired).toBe(false);

    // The injection text tried to approve SGD 1000 — verify it didn't work.
    expect(result.policyRecommendation.refundCents).not.toBe(100000);
    expect(result.policyRecommendation.approvalState).toBe("NOT_APPLICABLE");
  }, 60_000);

  it("agent output with refund_override fields does not approve refund", async () => {
    // The mock provider's "refund_override" fail mode returns a finding
    // with extra fields: approveRefund=true, refundAmount=99999, overridePolicy=true.
    const provider = new MockProvider({ failMode: "refund_override" });
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-refund-override"
    );

    // The advocate should complete (Zod strips unknown fields).
    expect(result.agents.riderAdvocate.status).toBe("COMPLETED");

    // Policy outcome is still INSUFFICIENT_EVIDENCE — not overridden.
    expect(result.policyRecommendation.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.policyRecommendation.refundCents).toBe(0);
    expect(result.policyRecommendation.approvalState).toBe("NOT_APPLICABLE");
    expect(result.humanApprovalRequired).toBe(false);
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("Agent layer — policy outcome cannot be overridden by LLM output", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
    await submitStage2Geotag();
  });

  it("even with refund_override, Stage 2 policy outcome is REFUND_FULL (not 99999)", async () => {
    const provider = new MockProvider({ failMode: "refund_override" });
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-no-override-stage2"
    );

    // Policy outcome is REFUND_FULL, 500 cents — not 99999.
    expect(result.policyRecommendation.outcome).toBe("REFUND_FULL");
    expect(result.policyRecommendation.refundCents).toBe(500);
    expect(result.policyRecommendation.approvalState).toBe("PENDING");
    expect(result.humanApprovalRequired).toBe(true);

    // No agent approved anything.
    expect(result.policyRecommendation.refundCents).not.toBe(99999);
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("Agent layer — snapshot consistency", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("evidence snapshot matches the state at investigation start", async () => {
    // Run investigation.
    const provider = new MockProvider();
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-snapshot-consistency"
    );

    // Get the current DB state.
    const dispute = await prisma.dispute.findFirst({
      where: { caseCode: "RT-001" },
      include: { evidence: true },
    });

    // The snapshot should have the same number of entries as the DB.
    expect(result.evidenceSnapshot.length).toBe(dispute!.evidence.length);

    // Each snapshot entry should have a matching DB record.
    for (const entry of result.evidenceSnapshot) {
      const dbRecord = dispute!.evidence.find((e) => String(e.id) === entry.evidenceId);
      expect(dbRecord).toBeDefined();
      expect(dbRecord!.hash).toBe(entry.hash);
      expect(dbRecord!.version).toBe(entry.version);
      expect(dbRecord!.refGroup).toBe(entry.refGroup);
    }
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("Agent layer — too many tool calls enforced", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("agent exceeding max tool calls fails", async () => {
    const provider = new MockProvider({ failMode: "too_many_tool_calls" });
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-max-calls"
    );

    // The advocate should fail after exceeding the tool call limit.
    expect(result.agents.riderAdvocate.status).toBe("FAILED");
    expect(result.status).toBe("ESCALATED");
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});

describe("Agent layer — error handling", () => {
  beforeAll(async () => {
    await resetRT001ToStage1();
  });

  it("investigation of unknown case returns FAILED", async () => {
    const provider = new MockProvider();
    const result = await investigateCase(
      "UNKNOWN-CASE",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-unknown"
    );

    expect(result.status).toBe("FAILED");
    expect(result.escalationReason).toContain("Case not found");
  }, 60_000);

  it("investigation with unknown policy returns FAILED", async () => {
    const provider = new MockProvider();
    const result = await investigateCase(
      "RT-001",
      provider,
      "DOES_NOT_EXIST",
      "system:test-unknown-policy"
    );

    expect(result.status).toBe("FAILED");
    expect(result.escalationReason).toContain("Policy not found");
  }, 60_000);

  it("investigation with tampered evidence returns FAILED", async () => {
    // Tamper with an evidence record.
    const dispute = await prisma.dispute.findFirst({
      where: { caseCode: "RT-001" },
      include: { evidence: true },
    });
    const evidence = dispute!.evidence[0];
    const originalPayload = JSON.parse(evidence.payload);
    if (originalPayload.trail) {
      originalPayload.trail[0].lat = 9.99999;
    } else {
      originalPayload.tampered = true;
    }
    await prisma.evidence.update({
      where: { id: evidence.id },
      data: { payload: JSON.stringify(originalPayload) },
    });

    const provider = new MockProvider();
    const result = await investigateCase(
      "RT-001",
      provider,
      "CANCELLATION_FEE_SG",
      "system:test-tampered"
    );

    expect(result.status).toBe("FAILED");
    expect(result.escalationReason!.toLowerCase()).toContain("evidence integrity");

    // Reset for subsequent tests.
    await resetRT001ToStage1();
  }, 60_000);

  afterAll(async () => {
    await resetRT001ToStage1();
  });
});
