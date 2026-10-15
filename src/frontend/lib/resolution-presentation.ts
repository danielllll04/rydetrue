import type { CaseDetail, Recommendation } from "./api-types";
import { money, outcomeLabel } from "./view-model";

/** Resolution-only wording; recommendation values are never changed. */
export function resolutionTitle(rec: Recommendation) {
  if (["REFUND_FULL", "REFUND_PARTIAL"].includes(rec.outcome)) {
    const kind = rec.outcome === "REFUND_FULL" ? "Full" : "Partial";
    const state =
      rec.approvalState === "APPROVED"
        ? "approved"
        : rec.approvalState === "REJECTED"
          ? "recommendation rejected"
          : rec.approvalState === "PENDING"
            ? "pending approval"
            : "recommended";
    return `${kind} refund ${state} — ${money(rec.refundCents)}`;
  }
  return outcomeLabel(rec.outcome);
}

export function resolutionDecision(rec: Recommendation | null) {
  if (!rec) return "No recommendation or human decision is recorded yet.";
  const actor = rec.approvedBy ? ` by ${rec.approvedBy}` : "";
  if (rec.approvalState === "APPROVED")
    return `Human approval recorded${actor}. All monetary actions are simulated.`;
  if (rec.approvalState === "REJECTED")
    return `Human rejection recorded${actor}. This recommendation was not approved. No real money is moved.`;
  if (rec.approvalState === "PENDING")
    return "Awaiting an explicit human decision. This recommendation is not approved. No real money is moved.";
  return "No refund approval is pending for this recommendation. No real money is moved.";
}

/** The backend joins a rule description and expanded note with an em dash.
 * Show its concise description once; retain the full rationale in record details.
 * Only exact repeated sentences are removed from other explanation formats. */
export function resolutionExplanation(
  rec: Pick<Recommendation, "rationale" | "citations">,
) {
  const description = rec.citations.some((c) => c.ruleId)
    ? rec.rationale.split(" — ")[0]
    : rec.rationale;
  const seen = new Set<string>();
  return description
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const key = sentence
        .trim()
        .replace(/[.!?]+$/, "")
        .toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ");
}

/** Every transition compares adjacent persisted snapshots, including recovery runs. */
export function resolutionHistory(
  detail: Pick<CaseDetail, "recommendationHistory" | "audit">,
) {
  const ordered = [...detail.recommendationHistory].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  return ordered.map((item, index) => {
    const previous = ordered[index - 1];
    const additions = previous
      ? item.evidenceSnapshot.filter(
          (entry) =>
            !previous.evidenceSnapshot.some(
              (old) =>
                old.evidenceId === entry.evidenceId &&
                old.version === entry.version &&
                old.hash === entry.hash,
            ),
        )
      : [];
    return {
      item,
      additions: additions.map((entry) => ({
        ...entry,
        submittedAt: detail.audit.find(
          (event) =>
            event.action === "SUBMIT_EVIDENCE" &&
            event.payload.evidenceId === entry.evidenceId,
        )?.createdAt,
      })),
    };
  });
}
