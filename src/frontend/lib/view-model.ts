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
  return reviewBlockReason(detail) === null;
}

/** Presentation gate only. The confirmation handler still re-reads the case. */
export function reviewBlockReason(detail: CaseDetail): string | null {
  const rec = detail.currentRecommendation;
  if (!rec) return "Run an investigation before making a human decision.";
  if (detail.status === "INVESTIGATING")
    return "An investigation is in progress. Wait for the updated recommendation.";
  if (rec.supersededById || rec.isCurrent === false)
    return "This recommendation has been replaced. Refresh to review the current version.";
  if (["APPROVED", "REJECTED"].includes(rec.approvalState))
    return `Human ${rec.approvalState === "APPROVED" ? "approval" : "rejection"} is already recorded. This decision cannot be submitted again.`;
  if (["APPROVED", "REJECTED", "CLOSED"].includes(detail.status))
    return "This case is closed or already decided. Refresh and inspect the recorded decision before review.";
  if (!isSnapshotCurrent(detail))
    return "New or changed evidence is outside this snapshot. Reinvestigate before approving or rejecting.";
  if (
    !detail.evidence.groups.length ||
    !detail.evidence.integrity.every((e) => e.hashMatches) ||
    !evidenceRows(detail).every((e) => e.id && e.hashMatches)
  )
    return "Evidence verification is incomplete or failed. Human decision controls are unavailable.";
  if (rec.sufficiencyState !== "SUFFICIENT")
    return "Evidence is not sufficient for a refund decision. Review the recorded gaps and add evidence before reinvestigating.";
  if (rec.approvalState !== "PENDING" || rec.refundCents <= 0)
    return "There is no pending refund to approve or reject for this recommendation.";
  return null;
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

const evidenceNames: Record<string, string> = {
  "rider-gps": "Rider GPS",
  "driver-gps": "Driver GPS",
  "trip-chat": "Trip chat",
  "trip-telemetry": "Trip telemetry",
  "third-party-geotag": "Independent geotag",
};
export const evidenceGroupLabel = (group: string) =>
  evidenceNames[group] || humanize(group.replaceAll("-", "_"));

/** Resolve labels by exact record/version, including historical citations. */
export function evidenceLabel(detail: CaseDetail, id: string) {
  if (id === "policy") return "Policy rule";
  if (id === "trip") return "Trip record";
  const record = detail.evidence.integrity.find((e) => e.id === id);
  const snapshot = detail.recommendationHistory
    .flatMap((r) => r.evidenceSnapshot)
    .find((e) => e.evidenceId === id);
  const source = record || snapshot;
  return source
    ? `${evidenceGroupLabel(source.refGroup)} · v${source.version}`
    : "Evidence record";
}

/** Only substitute exact known IDs for display; the saved finding stays intact. */
export function readableFindingText(detail: CaseDetail, text: string) {
  return detail.evidence.integrity.reduce(
    (copy, e) => copy.split(e.id).join(evidenceLabel(detail, e.id)),
    text,
  );
}

export function outcomeLabel(outcome: string) {
  const labels: Record<string, string> = {
    REFUND_FULL: "Full refund recommended",
    REFUND_PARTIAL: "Partial refund recommended",
    NO_REFUND: "No refund recommended",
    SPLIT: "Split resolution recommended",
    INCONCLUSIVE: "No conclusive outcome",
    INSUFFICIENT_EVIDENCE: "More evidence needed",
    ESCALATE_FOR_REVIEW: "Human review needed",
  };
  return labels[outcome] || humanize(outcome);
}

export function investigationJourney(detail: CaseDetail) {
  const rec = detail.currentRecommendation;
  const first = detail.recommendationHistory[0];
  const independent = detail.evidence.groups.filter(
    (e) => e.type === "THIRD_PARTY_GEOTAG",
  );
  const fresh = isSnapshotCurrent(detail);
  const run = currentInvestigation(detail);
  const reviewed =
    fresh &&
    detail.recommendationHistory.length > 1 &&
    independent.length > 0 &&
    run.completion?.payload.status === "COMPLETED";
  const decided = !!rec && ["APPROVED", "REJECTED"].includes(rec.approvalState);
  const current = !rec
    ? 0
    : !fresh || run.completion?.payload.status === "ESCALATED"
      ? 2
      : decided || canReview(detail)
        ? 3
        : independent.length
          ? 2
          : 1;
  return [
    {
      title: "Initial assessment",
      complete: !!first,
      description: first
        ? outcomeLabel(first.outcome)
        : "Both accounts, before any conclusion",
    },
    {
      title: "Independent evidence",
      complete: independent.length > 0,
      description: independent.length
        ? "Independent geotag recorded"
        : "No independent geotag recorded",
    },
    {
      title: "Reinvestigation",
      complete: reviewed,
      description: reviewed
        ? "Agents reviewed the current snapshot"
        : rec && !fresh
          ? "New evidence awaits investigation"
          : run.completion?.payload.status === "ESCALATED"
            ? "Agent review needs attention"
            : "Reassess when evidence changes",
    },
    {
      title: "Human decision",
      complete: decided,
      description: decided
        ? `${humanize(rec!.approvalState)} · recorded by a person`
        : canReview(detail)
          ? "Ready for an explicit human decision"
          : "Waiting for an eligible recommendation",
    },
  ].map((step, index) => ({
    ...step,
    current: index === current && !step.complete,
  }));
}
