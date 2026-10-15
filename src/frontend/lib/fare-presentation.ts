import type { CaseDetail } from "./api-types";
import { assessFare } from "@/lib/fare-policy";
import { fareQuoteSchema, fareReceiptSchema } from "@/lib/fare-contracts";
import type { EvidenceGroup } from "@/lib/evidence";
import { evidenceRows } from "./view-model";

export const isFareCase = (detail: Pick<CaseDetail, "category">) =>
  detail.category === "FARE_DISCREPANCY";
export const caseAmountCents = (detail: CaseDetail) =>
  isFareCase(detail)
    ? detail.trip.fareAmountCents
    : (detail.trip.cancellationFeeCents ?? 0);
export function farePresentation(detail: CaseDetail) {
  const groups: EvidenceGroup[] = evidenceRows(detail).map((row) => ({
    refGroup: row.refGroup,
    type: row.type,
    source: row.source,
    history: [],
    latest: {
      id: row.id,
      version: row.latestVersion,
      hash: row.latestHash,
      capturedAt: new Date(row.latestCapturedAt),
      payload: (row.hashMatches
        ? row.payload
        : {}) as EvidenceGroup["latest"]["payload"],
    },
  }));
  const only = (type: string) => {
    const matches = groups.filter((g) => g.type === type);
    return matches.length === 1 ? matches[0].latest.payload : null;
  };
  const quote = fareQuoteSchema.safeParse(only("FARE_QUOTE"));
  const receipt = fareReceiptSchema.safeParse(only("FARE_RECEIPT"));
  const assessment = assessFare({
    caseCode: detail.caseCode,
    currency: detail.trip.currency,
    tripStatus: detail.trip.status,
    chargedCents: detail.trip.fareAmountCents,
    hasRiderStatement: detail.statements.some((s) => s.role === "RIDER"),
    hasDriverStatement: detail.statements.some((s) => s.role === "DRIVER"),
    groups,
  });
  return {
    quote: quote.success ? quote.data : null,
    receipt: receipt.success ? receipt.data : null,
    ...assessment,
  };
}
