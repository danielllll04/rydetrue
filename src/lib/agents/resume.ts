import { prisma } from "../db";
import { hashPayload } from "../evidence";
import { advocateFindingSchema, type AdvocateFinding } from "./schemas";
import { validateCitations } from "./tools";
import type { AgentExecutionResult, EvidenceSnapshot } from "./types";

/** Reuse genuine completed advocates only for an explicit retry of the latest
 * failed investigation, after all inputs and outputs have been revalidated. */
export async function loadCompletedAdvocates(
  disputeId: string,
  sourceId: string,
  fingerprint: string,
  snapshot: EvidenceSnapshot,
) {
  const current = await prisma.recommendation.findFirst({
    where: { disputeId, supersededById: null },
    orderBy: { createdAt: "desc" },
  });
  if (
    !current ||
    !["PENDING", "NOT_APPLICABLE"].includes(current.approvalState)
  )
    throw new Error("retry_context_mismatch");
  const audits = await prisma.auditEvent.findMany({
    where: { disputeId, action: "INVESTIGATION_COMPLETE" },
    orderBy: { createdAt: "desc" },
  });
  const completion = audits
    .map((a) => JSON.parse(a.payload))
    .find(
      (a) =>
        a.investigationId === sourceId && a.recommendationId === current.id,
    );
  if (
    !completion ||
    completion.status !== "ESCALATED" ||
    completion.inputFingerprint !== fingerprint ||
    completion.provider !== "groq"
  )
    throw new Error("retry_context_mismatch");
  const records = await prisma.agentFinding.findMany({
    where: { disputeId, agent: { in: ["RIDER_ADVOCATE", "DRIVER_ADVOCATE"] } },
  });
  const result: Partial<
    Record<
      "RIDER_ADVOCATE" | "DRIVER_ADVOCATE",
      AgentExecutionResult<AdvocateFinding>
    >
  > = {};
  for (const role of ["RIDER_ADVOCATE", "DRIVER_ADVOCATE"] as const) {
    if (
      completion[
        role === "RIDER_ADVOCATE" ? "riderAdvocate" : "driverAdvocate"
      ] !== "COMPLETED"
    )
      continue;
    const record = records.find(
      (r) =>
        r.agent === role && JSON.parse(r.payload).investigationId === sourceId,
    );
    if (!record) throw new Error("retry_finding_invalid");
    const payload = JSON.parse(record.payload);
    const finding = advocateFindingSchema.parse(payload);
    const refs = [
      ...finding.supportingPoints,
      ...finding.weakeningPoints,
    ].flatMap((p) => p.citedEvidenceIds);
    const digest = hashPayload(finding);
    if (
      payload.inputFingerprint !== fingerprint ||
      payload.provider !== "groq" ||
      payload.findingHash !== digest ||
      completion.findingHashes?.[role] !== digest ||
      finding.agentRole !== role ||
      finding.party !== (role === "RIDER_ADVOCATE" ? "RIDER" : "DRIVER") ||
      !refs.length ||
      !validateCitations(refs, snapshot).valid ||
      !Number.isInteger(payload.toolCallsUsed) ||
      payload.toolCallsUsed < 1 ||
      payload.toolCallsUsed > 8
    )
      throw new Error("retry_finding_invalid");
    result[role] = {
      status: "COMPLETED",
      finding,
      error: null,
      toolCallsUsed: payload.toolCallsUsed,
      durationMs: 0,
      reusedFromInvestigationId: sourceId,
    };
  }
  return result;
}
