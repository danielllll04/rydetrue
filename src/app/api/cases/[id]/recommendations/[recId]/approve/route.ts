import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { approveRequestSchema } from "@/lib/schemas";

interface RouteParams {
  params: { id: string; recId: string };
}

/**
 * POST /api/cases/[id]/recommendations/[recId]/approve
 *
 * Human approval or rejection of a recommendation. All monetary actions
 * (refunds) are simulated — no real money is moved. The approval is required
 * before any refund is "executed".
 *
 * Sets approvalState to APPROVED or REJECTED, records who approved and when,
 * and creates an audit event. Updates the case status accordingly.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseCode, recId } = params;

  let body;
  try {
    body = approveRequestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_request", details: (err as Error).message },
      { status: 400 }
    );
  }

  // Find the dispute.
  const dispute = await prisma.dispute.findFirst({
    where: { caseCode },
  });
  if (!dispute) {
    return NextResponse.json({ error: "case_not_found", caseCode }, { status: 404 });
  }

  // Find the recommendation.
  const recommendation = await prisma.recommendation.findFirst({
    where: { id: recId, disputeId: dispute.id },
  });
  if (!recommendation) {
    return NextResponse.json(
      { error: "recommendation_not_found", caseCode, recommendationId: recId },
      { status: 404 }
    );
  }

  // Only PENDING recommendations can be approved/rejected.
  if (recommendation.approvalState !== "PENDING") {
    return NextResponse.json(
      {
        error: "already_actioned",
        caseCode,
        recommendationId: recId,
        currentApprovalState: recommendation.approvalState,
      },
      { status: 409 }
    );
  }

  const now = new Date();
  const updated = await prisma.recommendation.update({
    where: { id: recId },
    data: {
      approvalState: body.decision,
      approvedBy: body.actor,
      approvedAt: now,
    },
  });

  // Create audit event.
  await prisma.auditEvent.create({
    data: {
      disputeId: dispute.id,
      actor: body.actor,
      action: body.decision === "APPROVED" ? "APPROVE" : "REJECT",
      payload: JSON.stringify({
        recommendationId: recId,
        outcome: recommendation.outcome,
        refundCents: recommendation.refundCents,
        decision: body.decision,
        notes: body.notes ?? null,
        approvedAt: now.toISOString(),
        simulated: true, // All monetary actions are simulated
      }),
    },
  });

  // Update case status.
  const newStatus = body.decision === "APPROVED" ? "APPROVED" : "REJECTED";
  await prisma.dispute.update({
    where: { id: dispute.id },
    data: { status: newStatus },
  });

  return NextResponse.json({
    caseCode,
    recommendation: {
      id: updated.id,
      outcome: updated.outcome,
      sufficiencyState: updated.sufficiencyState,
      refundCents: updated.refundCents,
      approvalState: updated.approvalState,
      approvedBy: updated.approvedBy,
      approvedAt: updated.approvedAt,
      rationale: updated.rationale,
      citations: JSON.parse(updated.citations),
      evidenceSnapshot: JSON.parse(updated.evidenceSnapshot),
      policyVersionId: updated.policyVersionId,
      supersededById: updated.supersededById,
      createdAt: updated.createdAt,
      simulated: true,
    },
  });
}