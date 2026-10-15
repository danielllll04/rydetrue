import { withDemoSession } from "@/lib/public-demo";
import { NextRequest, NextResponse } from "next/server";
import { reviewRecommendation, ReviewError } from "@/lib/human-review";
import { approveRequestSchema } from "@/lib/schemas";

interface RouteParams {
  params: Promise<{ id: string; recId: string }> | { id: string; recId: string };
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
async function handlePOST(req: NextRequest, { params }: RouteParams) {
  const { id: caseCode, recId } = await params;

  let body;
  try {
    body = approveRequestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_request", details: (err as Error).message },
      { status: 400 }
    );
  }

  let updated;
  try { updated = await reviewRecommendation(caseCode, recId, body); }
  catch (error) {
    return NextResponse.json({ error: error instanceof ReviewError ? error.code : "review_conflict", caseCode, recommendationId: recId }, { status: error instanceof ReviewError ? error.status : 409 });
  }
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
export function POST(req: NextRequest, context: RouteParams): Promise<NextResponse>;
export function POST(req: NextRequest, context: { params: Promise<{ id: string; recId: string }> }): Promise<NextResponse>;
export async function POST(req: NextRequest, context: { params: Promise<{ id: string; recId: string }> | { id: string; recId: string } }) {
  return withDemoSession(req, request => handlePOST(request, context));
}
