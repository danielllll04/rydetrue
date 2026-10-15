import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { evaluateRequestSchema, Outcome } from "@/lib/schemas";
import {
  groupLatestByRefGroup,
  hashPayload,
  verifyHash,
} from "@/lib/evidence";
import { evaluateCategory } from "@/lib/category-policy";

interface RouteParams {
  params: { id: string };
}

/** Map outcome to case status. */
function outcomeToStatus(outcome: Outcome, refundCents: number): string {
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

/**
 * POST /api/cases/[id]/evaluate
 *
 * Evaluates a dispute against a policy version. Runs the sufficiency checker
 * first — if evidence is not SUFFICIENT, no policy rule is applied and the
 * outcome is INSUFFICIENT_EVIDENCE / ESCALATE_FOR_REVIEW / INCONCLUSIVE.
 *
 * The previous recommendation is superseded (supersededById set) but preserved
 * in the recommendation history. The new recommendation records:
 *   - which evidence versions were considered (evidenceSnapshot)
 *   - which policy version was applied (policyVersionId)
 *   - the sufficiency state
 *   - approval state (PENDING for any monetary action)
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const caseCode = params.id;

  let body;
  try {
    body = evaluateRequestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_request", details: (err as Error).message },
      { status: 400 }
    );
  }

  const dispute = await prisma.dispute.findFirst({
    where: { caseCode },
    include: { trip: true, evidence: true, statements: true },
  });
  if (!dispute) {
    return NextResponse.json({ error: "case_not_found", caseCode }, { status: 404 });
  }

  // --- Hash integrity check ---
  const evidence = dispute.evidence;
  const corrupt = evidence.filter((e) => !verifyHash(e));
  if (corrupt.length > 0) {
    return NextResponse.json(
      {
        error: "evidence_integrity_failed",
        corruptEvidenceIds: corrupt.map((c) => c.id),
      },
      { status: 422 }
    );
  }

  // --- Find policy version ---
  const asOf = body.asOf ? new Date(body.asOf) : new Date();
  const policyRow = await prisma.policyVersion.findFirst({
    where: {
      code: body.policyCode,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
    },
    orderBy: { version: "desc" },
  });
  if (!policyRow) {
    return NextResponse.json(
      { error: "policy_not_found", code: body.policyCode, asOf: asOf.toISOString() },
      { status: 404 }
    );
  }

  let evaluated: ReturnType<typeof evaluateCategory>;
  try { evaluated = evaluateCategory(dispute, policyRow); }
  catch { return NextResponse.json({ error: "invalid_category_policy_or_evidence" }, { status: 422 }); }
  const { sufficiency, evaluation } = evaluated;
  const groups = groupLatestByRefGroup(evidence);

  // --- Build evidence snapshot (which evidence versions were considered) ---
  const evidenceSnapshot = groups.map((g) => ({
    evidenceId: String(g.latest.id),
    refGroup: g.refGroup,
    type: g.type,
    version: g.latest.version,
    hash: g.latest.hash,
  }));

  // --- Map refGroup names to evidence IDs for citations ---
  const evidenceIdMap = new Map<string, string>();
  for (const g of groups) {
    evidenceIdMap.set(g.refGroup, String(g.latest.id));
  }
  const citations = evaluation.citations.map((c) => ({
    ...c,
    evidenceId: evidenceIdMap.get(c.evidenceId) ?? c.evidenceId,
  }));

  // --- Compute recommendation hash ---
  const recommendationHash = hashPayload({
    caseCode,
    outcome: evaluation.outcome,
    sufficiencyState: evaluation.sufficiencyState,
    refundCents: evaluation.refundCents,
    matchedRuleId: evaluation.matchedRuleId,
    evidenceSnapshot,
    policyVersion: evaluation.policyVersion,
  });

  // --- Determine approval state ---
  const needsApproval = evaluation.refundCents > 0;
  const approvalState = needsApproval ? "PENDING" : "NOT_APPLICABLE";

  // --- Persist: supersede previous recommendation + create new + audit ---
  const previousCurrent = await prisma.recommendation.findFirst({
    where: { disputeId: dispute.id, supersededById: null },
    orderBy: { createdAt: "desc" },
  });

  const newRec = await prisma.recommendation.create({
    data: {
      disputeId: dispute.id,
      policyVersionId: policyRow.id,
      outcome: evaluation.outcome,
      sufficiencyState: evaluation.sufficiencyState,
      refundCents: evaluation.refundCents,
      rationale: evaluation.rationale,
      citations: JSON.stringify(citations),
      evidenceSnapshot: JSON.stringify(evidenceSnapshot),
      approvalState,
    },
  });

  // Supersede the previous recommendation.
  if (previousCurrent) {
    await prisma.recommendation.update({
      where: { id: previousCurrent.id },
      data: { supersededById: newRec.id },
    });
  }

  // Create audit event.
  await prisma.auditEvent.create({
    data: {
      disputeId: dispute.id,
      actor: body.actor,
      action: "EVALUATE",
      payload: JSON.stringify({
        policyCode: evaluation.policyCode,
        policyVersion: evaluation.policyVersion,
        sufficiencyState: evaluation.sufficiencyState,
        matchedRuleId: evaluation.matchedRuleId,
        outcome: evaluation.outcome,
        refundCents: evaluation.refundCents,
        recommendationHash,
        recommendationId: newRec.id,
        supersededRecommendationId: previousCurrent?.id ?? null,
        evidenceSnapshot,
        sufficiencyReasons: sufficiency.reasons,
        missingRequirements: sufficiency.missingRequirements,
      }),
    },
  });

  // Update case status.
  const newStatus = outcomeToStatus(evaluation.outcome, evaluation.refundCents);
  await prisma.dispute.update({
    where: { id: dispute.id },
    data: { status: newStatus },
  });

  return NextResponse.json({
    caseCode,
    recommendation: {
      id: newRec.id,
      outcome: evaluation.outcome,
      sufficiencyState: evaluation.sufficiencyState,
      refundCents: evaluation.refundCents,
      rationale: evaluation.rationale,
      citations,
      policyCode: evaluation.policyCode,
      policyVersion: evaluation.policyVersion,
      matchedRuleId: evaluation.matchedRuleId,
      approvalState,
      evidenceSnapshot,
      recommendationHash,
      supersededRecommendationId: previousCurrent?.id ?? null,
      metrics: evaluation.metrics,
    },
    sufficiency: {
      state: sufficiency.state,
      reasons: sufficiency.reasons,
      missingRequirements: sufficiency.missingRequirements,
    },
  });
}