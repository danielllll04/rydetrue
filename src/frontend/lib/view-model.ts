import type { CaseDetail, Recommendation } from "./api-types";
import {
  advocateFindingSchema,
  neutralResolutionSchema,
} from "@/lib/agents/schemas";
export const money = (cents: number) => `S$${(cents / 100).toFixed(2)}`;
export const humanize = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toUpperCase());
export const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  }).format(new Date(iso)) + " SGT";
export function currentInvestigation(detail: CaseDetail) {
  const rec = detail.currentRecommendation;
  const completion = [...detail.audit]
    .reverse()
    .find(
      (a) =>
        a.action === "INVESTIGATION_COMPLETE" &&
        a.payload.recommendationId === rec?.id,
    );
  const investigationId = completion?.payload.investigationId;
  const start = detail.audit.find(
    (a) =>
      a.action === "INVESTIGATE" &&
      a.payload.investigationId === investigationId,
  );
  const findings =
    typeof investigationId === "string"
      ? detail.findings.filter(
          (f) => f.payload.investigationId === investigationId,
        )
      : [];
  return {
    completion,
    investigationId,
    provider:
      typeof start?.payload.provider === "string"
        ? start.payload.provider
        : null,
    findings,
  };
}
export function agentViews(detail: CaseDetail) {
  const run = currentInvestigation(detail);
  return (
    ["RIDER_ADVOCATE", "DRIVER_ADVOCATE", "NEUTRAL_RESOLUTION"] as const
  ).map((role, i) => {
    const record = run.findings.find((f) => f.agent === role);
    const parsed =
      i === 2
        ? neutralResolutionSchema.safeParse(record?.payload)
        : advocateFindingSchema.safeParse(record?.payload);
    const finding = parsed.success ? parsed.data : null;
    const refs = finding
      ? "citedEvidenceIds" in finding
        ? finding.citedEvidenceIds
        : [
            ...new Set(
              [...finding.supportingPoints, ...finding.weakeningPoints].flatMap(
                (p) => p.citedEvidenceIds,
              ),
            ),
          ]
      : [];
    const executionKeys = [
      "riderAdvocate",
      "driverAdvocate",
      "neutralResolution",
    ] as const;
    const status =
      typeof run.completion?.payload[executionKeys[i]] === "string"
        ? String(run.completion.payload[executionKeys[i]])
        : "NOT_RUN";
    return {
      role,
      title: ["Rider Advocate", "Driver Advocate", "Neutral Resolution"][i],
      status,
      summary:
        record && finding
          ? record.summary
          : status === "NOT_RUN"
            ? "No agent findings for the current recommendation. Run an investigation to retrieve persisted advisory findings."
            : "This agent did not produce a validated finding. Review the investigation audit and deterministic result.",
      refs,
      uncertainty: finding?.uncertaintyLevel,
      finding,
      reusedFromInvestigationId:
        typeof record?.payload.reusedFromInvestigationId === "string"
          ? record.payload.reusedFromInvestigationId
          : null,
    };
  });
}
export function isSnapshotCurrent(
  detail: CaseDetail,
  recommendation: Recommendation | null = detail.currentRecommendation,
) {
  if (!recommendation) return false;
  const groups = detail.evidence.groups;
  return (
    groups.length === recommendation.evidenceSnapshot.length &&
    groups.every((g) =>
      recommendation.evidenceSnapshot.some(
        (e) =>
          e.refGroup === g.refGroup &&
          e.version === g.latestVersion &&
          e.hash === g.latestHash,
      ),
    )
  );
}
export function canReview(detail: CaseDetail) {
  const rec = detail.currentRecommendation;
  return (
    !!rec &&
    rec.approvalState === "PENDING" &&
    rec.refundCents > 0 &&
    rec.sufficiencyState === "SUFFICIENT" &&
    isSnapshotCurrent(detail) &&
    detail.evidence.integrity.every((e) => e.hashMatches)
  );
}
export function evidenceRows(detail: CaseDetail) {
  return detail.evidence.groups
    .map((group) => {
      const integrity = detail.evidence.integrity.find(
        (e) =>
          e.refGroup === group.refGroup && e.version === group.latestVersion,
      );
      return {
        ...group,
        id: integrity?.id || "",
        hashMatches: integrity?.hashMatches ?? false,
      };
    })
    .sort((a, b) => a.latestCapturedAt.localeCompare(b.latestCapturedAt));
}

/** Some canonical orchestrator citations use refGroup names. Resolve them
 * against that recommendation's frozen snapshot, never the newest group. */
export function resolveCitationId(
  reference: string,
  recommendation: Recommendation,
) {
  return (
    recommendation.evidenceSnapshot.find(
      (entry) => entry.refGroup === reference,
    )?.evidenceId || reference
  );
}
