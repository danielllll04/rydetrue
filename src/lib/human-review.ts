import { z } from "zod";
import { prisma } from "./db";
import { evaluateCategory } from "./category-policy";
import { groupLatestByRefGroup, hashPayload } from "./evidence";

export class ReviewError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
const snapshotSchema = z.array(
  z.object({
    evidenceId: z.string(),
    refGroup: z.string(),
    type: z.string(),
    version: z.number().int(),
    hash: z.string(),
  }),
);

export async function reviewRecommendation(
  caseCode: string,
  recId: string,
  body: { decision: "APPROVED" | "REJECTED"; actor: string; notes?: string },
) {
  // SQLite serializes this transaction's read snapshot and conditional write.
  // Concurrent evidence/recommendation changes cause a conflict, never a stale decision.
  return prisma.$transaction(async (tx) => {
    const dispute = await tx.dispute.findUnique({
      where: { caseCode },
      include: { trip: true, evidence: true, statements: true },
    });
    if (!dispute) throw new ReviewError("case_not_found", 404);
    const recommendation = await tx.recommendation.findFirst({
      where: { id: recId, disputeId: dispute.id },
      include: { policyVersion: true },
    });
    if (!recommendation) throw new ReviewError("recommendation_not_found", 404);
    if (recommendation.approvalState !== "PENDING")
      throw new ReviewError("already_actioned");
    const currents = await tx.recommendation.findMany({
      where: { disputeId: dispute.id, supersededById: null },
      select: { id: true },
    });
    if (
      recommendation.supersededById ||
      currents.length !== 1 ||
      currents[0].id !== recId
    )
      throw new ReviewError("stale_recommendation");
    if (
      recommendation.sufficiencyState !== "SUFFICIENT" ||
      recommendation.refundCents <= 0 ||
      !["REFUND_FULL", "REFUND_PARTIAL", "SPLIT"].includes(
        recommendation.outcome,
      )
    )
      throw new ReviewError("recommendation_ineligible");
    let evaluated: ReturnType<typeof evaluateCategory>;
    try {
      evaluated = evaluateCategory(dispute, recommendation.policyVersion);
    } catch {
      throw new ReviewError("evidence_or_policy_ineligible");
    }
    const policyNow = await tx.policyVersion.findFirst({
      where: {
        code: recommendation.policyVersion.code,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { version: "desc" },
    });
    if (policyNow?.id !== recommendation.policyVersionId)
      throw new ReviewError("stale_policy");
    const { evaluation } = evaluated;
    if (
      evaluation.sufficiencyState !== "SUFFICIENT" ||
      evaluation.outcome !== recommendation.outcome ||
      evaluation.refundCents !== recommendation.refundCents
    )
      throw new ReviewError("recommendation_ineligible");
    const groups = groupLatestByRefGroup(dispute.evidence);
    const currentSnapshot = groups.map((g) => ({
      evidenceId: String(g.latest.id),
      refGroup: g.refGroup,
      type: g.type,
      version: g.latest.version,
      hash: g.latest.hash,
    }));
    const normalize = (value: z.infer<typeof snapshotSchema>) =>
      [...value].sort((a, b) => a.refGroup.localeCompare(b.refGroup));
    try {
      if (
        hashPayload(
          normalize(
            snapshotSchema.parse(JSON.parse(recommendation.evidenceSnapshot)),
          ),
        ) !== hashPayload(normalize(currentSnapshot))
      )
        throw new Error();
    } catch {
      throw new ReviewError("stale_evidence_snapshot");
    }
    const now = new Date();
    const changed = await tx.recommendation.updateMany({
      where: {
        id: recId,
        disputeId: dispute.id,
        approvalState: "PENDING",
        supersededById: null,
      },
      data: {
        approvalState: body.decision,
        approvedBy: body.actor,
        approvedAt: now,
      },
    });
    if (changed.count !== 1) throw new ReviewError("review_conflict");
    await tx.auditEvent.create({
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
          evidenceSnapshotHash: hashPayload(normalize(currentSnapshot)),
          simulated: true,
        }),
      },
    });
    await tx.dispute.update({
      where: { id: dispute.id },
      data: { status: body.decision },
    });
    return {
      ...recommendation,
      approvalState: body.decision,
      approvedBy: body.actor,
      approvedAt: now,
    };
  });
}
