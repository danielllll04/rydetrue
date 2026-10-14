/**
 * Case Investigation Orchestrator.
 *
 * Implements the 10-step pipeline:
 *  1.  Load case and validate evidence integrity
 *  2.  Create a fixed evidence snapshot
 *  3.  Execute Rider Advocate
 *  4.  Execute Driver Advocate (independently)
 *  5.  Validate both findings and citations
 *  6.  Execute Neutral Resolution Agent
 *  7.  Run deterministic sufficiency and policy evaluation
 *  8.  Validate that the resolution explanation matches the policy result
 *  9.  Persist findings, recommendation linkage and audit events
 *  10. Return structured investigation results
 *
 * Safety properties:
 *  - Evidence snapshot is frozen at step 2 — drift is detected
 *  - Agents cannot override the deterministic policy outcome
 *  - Provider failures fall back to human review (ESCALATED)
 *  - No financial actions are executed — all are simulated + human-gated
 */

import { prisma } from "@/lib/db";
import {
  groupLatestByRefGroup,
  verifyHash,
  hashPayload,
} from "@/lib/evidence";
import {
  checkSufficiency,
  extractGeotag,
} from "@/lib/sufficiency";
import { evaluatePolicy, trailsFromGroups, Policy } from "@/lib/policy";
import { LLMProvider } from "./provider";
import {
  EvidenceSnapshot,
  EvidenceSnapshotEntry,
  InvestigationResult,
  InvestigationStatus,
  AgentExecutionResult,
} from "./types";
import { ToolContext } from "./tools";
import { runAdvocate } from "./advocate";
import { runNeutralResolution } from "./neutral";
import {
  riderAdvocatePrompt,
  driverAdvocatePrompt,
} from "./prompts";
import { EVIDENCE_TOOLS } from "./tools";
import { AdvocateFinding } from "./schemas";
import { NeutralResolution } from "./schemas";
import { EvaluationResult } from "@/lib/policy";
import { SufficiencyResult } from "@/lib/sufficiency";

const INVESTIGATION_TIMEOUT_MS = 120_000;

/**
 * Run a full case investigation.
 *
 * @param caseCode - e.g. "RT-001"
 * @param provider - LLM provider (real or mock)
 * @param policyCode - e.g. "CANCELLATION_FEE_SG"
 * @param actor - who triggered the investigation
 * @returns Structured investigation result
 */
export async function investigateCase(
  caseCode: string,
  provider: LLMProvider,
  policyCode: string,
  actor: string
): Promise<InvestigationResult> {
  const investigationId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();

  // -------------------------------------------------------------------------
  // STEP 1: Load case and validate evidence integrity
  // -------------------------------------------------------------------------
  const dispute = await prisma.dispute.findFirst({
    where: { caseCode },
    include: { trip: true, evidence: true, statements: true },
  });

  if (!dispute) {
    return buildErrorResult(
      investigationId,
      caseCode,
      "Case not found",
      "case_not_found"
    );
  }

  // Hash integrity check — detect tampered evidence.
  const corrupt = dispute.evidence.filter((e) => !verifyHash(e));
  if (corrupt.length > 0) {
    return buildErrorResult(
      investigationId,
      caseCode,
      `Evidence integrity failed: ${corrupt.length} corrupt record(s)`,
      "evidence_integrity_failed"
    );
  }

  // Update case status to INVESTIGATING.
  await prisma.dispute.update({
    where: { id: dispute.id },
    data: { status: "INVESTIGATING" },
  });

  // Create INVESTIGATE audit event.
  await prisma.auditEvent.create({
    data: {
      disputeId: dispute.id,
      actor,
      action: "INVESTIGATE",
      payload: JSON.stringify({
        investigationId,
        provider: provider.name,
        policyCode,
        startedAt: new Date().toISOString(),
      }),
    },
  });

  // -------------------------------------------------------------------------
  // STEP 2: Create a fixed evidence snapshot
  // -------------------------------------------------------------------------
  const groups = groupLatestByRefGroup(dispute.evidence);

  const snapshotEntries: EvidenceSnapshotEntry[] = groups.map((g) => ({
    evidenceId: String(g.latest.id),
    refGroup: g.refGroup,
    type: g.type,
    source: g.source,
    version: g.latest.version,
    hash: g.latest.hash,
    capturedAt: g.latest.capturedAt.toISOString(),
    payload: g.latest.payload,
  }));

  const snapshot: EvidenceSnapshot = {
    investigationId,
    caseCode,
    entries: snapshotEntries,
    snapshotHash: hashPayload(snapshotEntries),
  };

  // Build the tool context for advocate agents.
  const toolContext: ToolContext = {
    snapshot,
    statements: dispute.statements.map((s) => ({
      role: s.role,
      authorAlias: s.authorAlias,
      text: s.text,
      submittedAt: s.submittedAt.toISOString(),
    })),
    tripInfo: {
      caseCode: dispute.trip.caseCode,
      city: dispute.trip.city,
      status: dispute.trip.status,
      pickupLabel: dispute.trip.pickupLabel,
      pickupLat: dispute.trip.pickupLat,
      pickupLng: dispute.trip.pickupLng,
      dropoffLabel: dispute.trip.dropoffLabel,
      dropoffLat: dispute.trip.dropoffLat,
      dropoffLng: dispute.trip.dropoffLng,
      fareAmountCents: dispute.trip.fareAmountCents,
      currency: dispute.trip.currency,
      cancellationFeeCents: dispute.trip.cancellationFeeCents,
      requestedAt: dispute.trip.requestedAt.toISOString(),
      acceptedAt: dispute.trip.acceptedAt?.toISOString() ?? null,
      cancelledAt: dispute.trip.cancelledAt?.toISOString() ?? null,
    },
  };

  // -------------------------------------------------------------------------
  // STEP 7 (pre-compute): Run deterministic sufficiency + policy evaluation
  // This runs BEFORE the neutral agent so the agent can reference it.
  // -------------------------------------------------------------------------
  const { riderGpsTrail, driverGpsTrail } = trailsFromGroups(groups);
  const thirdPartyGeotag = extractGeotag(groups);

  let waitSeconds = 0;
  for (const g of groups) {
    if (g.type === "TRIP_TELEMETRY") {
      const p = g.latest.payload;
      if (p.type === "TRIP_TELEMETRY" && p.waitSeconds !== undefined) {
        waitSeconds = p.waitSeconds;
      }
    }
  }

  const hasRiderStatement = dispute.statements.some((s) => s.role === "RIDER");
  const hasDriverStatement = dispute.statements.some((s) => s.role === "DRIVER");
  const hasTripTelemetry = groups.some((g) => g.type === "TRIP_TELEMETRY");

  const sufficiency: SufficiencyResult = checkSufficiency({
    hasRiderStatement,
    hasDriverStatement,
    hasTripTelemetry,
    riderGpsTrail,
    driverGpsTrail,
    thirdPartyGeotag,
  });

  // Find policy version.
  const policyRow = await prisma.policyVersion.findFirst({
    where: {
      code: policyCode,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
    orderBy: { version: "desc" },
  });

  if (!policyRow) {
    return buildErrorResult(
      investigationId,
      caseCode,
      `Policy not found: ${policyCode}`,
      "policy_not_found"
    );
  }

  const policy: Policy = (() => {
    const parsed = JSON.parse(policyRow.rules);
    return {
      code: policyRow.code,
      version: policyRow.version,
      description: policyRow.description,
      rules: parsed.rules,
      fallback: parsed.fallback,
    };
  })();

  const policyEvaluation: EvaluationResult = evaluatePolicy(
    {
      pickup: { lat: dispute.trip.pickupLat, lng: dispute.trip.pickupLng },
      riderGpsTrail,
      driverGpsTrail,
      thirdPartyGeotag,
      fareCents: dispute.trip.fareAmountCents,
      cancellationFeeCents: dispute.trip.cancellationFeeCents ?? 0,
      waitSeconds,
      hasRiderStatement,
      hasDriverStatement,
      hasTripTelemetry,
      evidenceById: new Map(),
    },
    policy,
    sufficiency.state
  );

  // -------------------------------------------------------------------------
  // STEP 3 & 4: Execute Rider Advocate and Driver Advocate
  // (independently, in parallel for efficiency)
  // -------------------------------------------------------------------------
  const riderSystemPrompt = riderAdvocatePrompt(EVIDENCE_TOOLS);
  const driverSystemPrompt = driverAdvocatePrompt(EVIDENCE_TOOLS);

  const [riderResult, driverResult] = await Promise.all([
    runAdvocate(
      provider,
      { role: "RIDER_ADVOCATE", systemPrompt: riderSystemPrompt },
      toolContext
    ),
    runAdvocate(
      provider,
      { role: "DRIVER_ADVOCATE", systemPrompt: driverSystemPrompt },
      toolContext
    ),
  ]);

  // -------------------------------------------------------------------------
  // STEP 5: Validate both findings
  // -------------------------------------------------------------------------
  // (Validation already happened inside runAdvocate — if it failed,
  // the result status will be FAILED or ESCALATED.)

  let neutralResult: AgentExecutionResult<NeutralResolution> | null = null;
  let investigationStatus: InvestigationStatus = "COMPLETED";
  let escalationReason: string | null = null;

  if (riderResult.status !== "COMPLETED" || driverResult.status !== "COMPLETED") {
    // One or both advocates failed — escalate.
    investigationStatus = "ESCALATED";
    escalationReason =
      `Advocate investigation failed. ` +
      `Rider: ${riderResult.status} (${riderResult.error ?? "OK"}). ` +
      `Driver: ${driverResult.status} (${driverResult.error ?? "OK"}). ` +
      `Case requires human review.`;
  } else {
    // -----------------------------------------------------------------------
    // STEP 6: Execute Neutral Resolution Agent
    // -----------------------------------------------------------------------
    neutralResult = await runNeutralResolution(provider, {
      riderFinding: riderResult.finding as AdvocateFinding,
      driverFinding: driverResult.finding as AdvocateFinding,
      evidenceSnapshot: snapshot,
      sufficiency,
      policyEvaluation,
    });

    if (neutralResult.status !== "COMPLETED") {
      investigationStatus = "ESCALATED";
      escalationReason =
        `Neutral resolution agent failed: ${neutralResult.status} ` +
        `(${neutralResult.error ?? "unknown error"}). Case requires human review.`;
    }
  }

  // -------------------------------------------------------------------------
  // STEP 8: Validate resolution matches policy
  // (The neutral agent's explanation should be consistent with the
  // deterministic policy outcome. The agent cannot override it.)
  // -------------------------------------------------------------------------
  // The deterministic policy outcome is AUTHORITATIVE. Even if the neutral
  // agent disagreed (which it shouldn't, per its prompt), we use the
  // deterministic result. We log any discrepancy as an audit event.

  if (neutralResult?.finding) {
    const neutralExplanation = neutralResult.finding.policyAssessment;
    const policyOutcome = policyEvaluation.outcome;

    // Check for obvious disagreement (basic heuristic).
    // Use \b word boundaries so "insufficient" doesn't trigger "sufficient".
    const disagrees =
      (policyOutcome === "REFUND_FULL" &&
        /no refund|fee retained|deny/i.test(neutralExplanation)) ||
      (policyOutcome === "NO_REFUND" &&
        /refund|return.*fee|reimburse/i.test(neutralExplanation)) ||
      (policyOutcome === "INSUFFICIENT_EVIDENCE" &&
        /\bsufficient\b|enough evidence/i.test(neutralExplanation));

    if (disagrees) {
      // Log discrepancy but do NOT change the outcome.
      await prisma.auditEvent.create({
        data: {
          disputeId: dispute.id,
          actor: "system:orchestrator",
          action: "AGENT_POLICY_DISCREPANCY",
          payload: JSON.stringify({
            investigationId,
            policyOutcome,
            neutralAssessment: neutralExplanation,
            note: "Agent explanation may conflict with deterministic outcome. Deterministic result is authoritative.",
          }),
        },
      });
      // Don't escalate — the deterministic outcome is still valid.
      // But flag it for human awareness.
      if (investigationStatus === "COMPLETED") {
        investigationStatus = "PARTIAL";
      }
    }
  }

  // -------------------------------------------------------------------------
  // STEP 9: Persist findings, recommendation linkage, audit events
  // -------------------------------------------------------------------------

  // Persist agent findings.
  if (riderResult.finding) {
    await prisma.agentFinding.create({
      data: {
        disputeId: dispute.id,
        agent: "RIDER_ADVOCATE",
        summary: (riderResult.finding as AdvocateFinding).summary,
        payload: JSON.stringify({
          investigationId,
          ...riderResult.finding,
          toolCallsUsed: riderResult.toolCallsUsed,
          durationMs: riderResult.durationMs,
        }),
      },
    });
  }

  if (driverResult.finding) {
    await prisma.agentFinding.create({
      data: {
        disputeId: dispute.id,
        agent: "DRIVER_ADVOCATE",
        summary: (driverResult.finding as AdvocateFinding).summary,
        payload: JSON.stringify({
          investigationId,
          ...driverResult.finding,
          toolCallsUsed: driverResult.toolCallsUsed,
          durationMs: driverResult.durationMs,
        }),
      },
    });
  }

  if (neutralResult?.finding) {
    await prisma.agentFinding.create({
      data: {
        disputeId: dispute.id,
        agent: "NEUTRAL_RESOLUTION",
        summary: neutralResult.finding.recommendationExplanation,
        payload: JSON.stringify({
          investigationId,
          ...neutralResult.finding,
          durationMs: neutralResult.durationMs,
        }),
      },
    });
  }

  // Create or supersede recommendation (same logic as evaluate route).
  const evidenceSnapshotForRec = snapshotEntries.map((e) => ({
    evidenceId: e.evidenceId,
    refGroup: e.refGroup,
    type: e.type,
    version: e.version,
    hash: e.hash,
  }));

  const recommendationHash = hashPayload({
    caseCode,
    investigationId,
    outcome: policyEvaluation.outcome,
    sufficiencyState: policyEvaluation.sufficiencyState,
    refundCents: policyEvaluation.refundCents,
    matchedRuleId: policyEvaluation.matchedRuleId,
    evidenceSnapshot: evidenceSnapshotForRec,
    policyVersion: policyEvaluation.policyVersion,
  });

  const needsApproval = policyEvaluation.refundCents > 0;
  const approvalState = needsApproval ? "PENDING" : "NOT_APPLICABLE";

  const previousCurrent = await prisma.recommendation.findFirst({
    where: { disputeId: dispute.id, supersededById: null },
    orderBy: { createdAt: "desc" },
  });

  const newRec = await prisma.recommendation.create({
    data: {
      disputeId: dispute.id,
      policyVersionId: policyRow.id,
      outcome: policyEvaluation.outcome,
      sufficiencyState: policyEvaluation.sufficiencyState,
      refundCents: policyEvaluation.refundCents,
      rationale: policyEvaluation.rationale,
      citations: JSON.stringify(policyEvaluation.citations),
      evidenceSnapshot: JSON.stringify(evidenceSnapshotForRec),
      approvalState,
    },
  });

  if (previousCurrent) {
    await prisma.recommendation.update({
      where: { id: previousCurrent.id },
      data: { supersededById: newRec.id },
    });
  }

  // Map evidence IDs for citations.
  const evidenceIdMap = new Map<string, string>();
  for (const g of groups) {
    evidenceIdMap.set(g.refGroup, String(g.latest.id));
  }
  const citations = policyEvaluation.citations.map((c) => ({
    ...c,
    evidenceId: evidenceIdMap.get(c.evidenceId) ?? c.evidenceId,
  }));

  // Update case status.
  const newStatus = outcomeToStatus(
    policyEvaluation.outcome,
    policyEvaluation.refundCents
  );
  await prisma.dispute.update({
    where: { id: dispute.id },
    data: { status: newStatus },
  });

  // Create audit event for investigation completion.
  await prisma.auditEvent.create({
    data: {
      disputeId: dispute.id,
      actor: "system:orchestrator",
      action: "INVESTIGATION_COMPLETE",
      payload: JSON.stringify({
        investigationId,
        status: investigationStatus,
        riderAdvocate: riderResult.status,
        driverAdvocate: driverResult.status,
        neutralResolution: neutralResult?.status ?? "SKIPPED",
        sufficiencyState: sufficiency.state,
        policyOutcome: policyEvaluation.outcome,
        refundCents: policyEvaluation.refundCents,
        recommendationId: newRec.id,
        recommendationHash,
        evidenceSnapshotHash: snapshot.snapshotHash,
        escalationReason,
        durationMs: Date.now() - startTime,
      }),
    },
  });

  // -------------------------------------------------------------------------
  // STEP 10: Return structured investigation results
  // -------------------------------------------------------------------------
  return {
    investigationId,
    caseCode,
    status: investigationStatus,
    agents: {
      riderAdvocate: {
        status: riderResult.status,
        finding: riderResult.finding,
        error: riderResult.error,
        toolCallsUsed: riderResult.toolCallsUsed,
        durationMs: riderResult.durationMs,
      },
      driverAdvocate: {
        status: driverResult.status,
        finding: driverResult.finding,
        error: driverResult.error,
        toolCallsUsed: driverResult.toolCallsUsed,
        durationMs: driverResult.durationMs,
      },
      neutralResolution: {
        status: neutralResult?.status ?? "SKIPPED",
        finding: neutralResult?.finding ?? null,
        error: neutralResult?.error ?? null,
        toolCallsUsed: 0,
        durationMs: neutralResult?.durationMs ?? 0,
      },
    },
    evidenceSnapshot: snapshotEntries,
    sufficiency: {
      state: sufficiency.state,
      reasons: sufficiency.reasons,
      missingRequirements: sufficiency.missingRequirements,
    },
    policyRecommendation: {
      outcome: policyEvaluation.outcome,
      refundCents: policyEvaluation.refundCents,
      matchedRuleId: policyEvaluation.matchedRuleId,
      approvalState,
      rationale: policyEvaluation.rationale,
      policyCode: policyEvaluation.policyCode,
      policyVersion: policyEvaluation.policyVersion,
      recommendationId: newRec.id,
    },
    humanApprovalRequired: needsApproval,
    escalationReason,
  };
}

// ---------------------------------------------------------------------------

function outcomeToStatus(outcome: string, refundCents: number): string {
  switch (outcome) {
    case "INSUFFICIENT_EVIDENCE":
    case "ESCALATE_FOR_REVIEW":
    case "INCONCLUSIVE":
      return "PENDING_REVIEW";
    case "NO_REFUND":
      return "EVALUATED";
    case "REFUND_FULL":
    case "REFUND_PARTIAL":
    case "SPLIT":
      return refundCents > 0 ? "AWAITING_APPROVAL" : "EVALUATED";
    default:
      return "PENDING_REVIEW";
  }
}

function buildErrorResult(
  investigationId: string,
  caseCode: string,
  message: string,
  code: string
): InvestigationResult {
  return {
    investigationId,
    caseCode,
    status: "FAILED",
    agents: {
      riderAdvocate: {
        status: "SKIPPED",
        finding: null,
        error: message,
        toolCallsUsed: 0,
        durationMs: 0,
      },
      driverAdvocate: {
        status: "SKIPPED",
        finding: null,
        error: message,
        toolCallsUsed: 0,
        durationMs: 0,
      },
      neutralResolution: {
        status: "SKIPPED",
        finding: null,
        error: message,
        toolCallsUsed: 0,
        durationMs: 0,
      },
    },
    evidenceSnapshot: [],
    sufficiency: {
      state: "INSUFFICIENT_EVIDENCE",
      reasons: [message],
      missingRequirements: [],
    },
    policyRecommendation: {
      outcome: "INSUFFICIENT_EVIDENCE",
      refundCents: 0,
      matchedRuleId: null,
      approvalState: "NOT_APPLICABLE",
      rationale: `Investigation failed (${code}): ${message}`,
      policyCode: "unknown",
      policyVersion: 0,
      recommendationId: null,
    },
    humanApprovalRequired: false,
    escalationReason: `Investigation failed (${code}): ${message}`,
  };
}
