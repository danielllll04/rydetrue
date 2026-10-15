import type { ProviderMessage } from "./types";
import { fareEvidenceSchema } from "../fare-contracts";

/** Explicit mock findings derived only from records actually retrieved by this agent. */
export function fareMockAdvocate(messages: ProviderMessage[], rider: boolean) {
  const records = messages
    .filter((m) => m.role === "tool")
    .flatMap((m) => {
      try {
        const value = JSON.parse(m.content);
        const result = fareEvidenceSchema.safeParse(value.payload);
        return result.success && typeof value.evidenceId === "string"
          ? [{ id: value.evidenceId, payload: result.data }]
          : [];
      } catch {
        return [];
      }
    });
  const quote = records.find((r) => r.payload.type === "FARE_QUOTE");
  const receipt = records.find((r) => r.payload.type === "FARE_RECEIPT");
  const audit = records.find(
    (r) => r.payload.type === "FARE_ADJUSTMENT_RECORD",
  );
  const available = records.map((r) => r.id);
  const quoteText =
    quote?.payload.type === "FARE_QUOTE"
      ? `Accepted fixed quote: ${quote.payload.quotedCents} cents.`
      : "Accepted quote unavailable.";
  const receiptText =
    receipt?.payload.type === "FARE_RECEIPT"
      ? `Itemized charge: ${receipt.payload.chargedCents} cents; extras need explicit authorization.`
      : "Charged receipt unavailable.";
  const verified =
    audit?.payload.type === "FARE_ADJUSTMENT_RECORD" &&
    audit.payload.complete &&
    audit.payload.verification === "VERIFIED";
  const auditText =
    audit?.payload.type === "FARE_ADJUSTMENT_RECORD"
      ? audit.payload.extras
          .map(
            (e) =>
              `${e.id}: ${e.permitted ? "permitted" : "not permitted"}, ${e.permittedCents} cents authorized (${e.reason}).`,
          )
          .join(" ")
      : "A complete verified pricing audit is missing; the charge difference alone does not establish an overcharge.";
  const point = (claim: string, ids: string[]) => ({
    claim,
    citedEvidenceIds: ids,
    note: "Synthetic pricing evidence retrieved independently; explicit mock explanation.",
  });
  return {
    agentRole: rider ? "RIDER_ADVOCATE" : "DRIVER_ADVOCATE",
    party: rider ? "RIDER" : "DRIVER",
    supportingPoints: rider
      ? quote
        ? [point(quoteText, [quote.id])]
        : []
      : receipt
        ? [point(receiptText, [receipt.id])]
        : [],
    weakeningPoints: rider
      ? receipt
        ? [
            point(
              verified ? auditText : receiptText,
              verified && audit ? [audit.id] : [receipt.id],
            ),
          ]
        : []
      : quote
        ? [
            point(
              verified ? auditText : quoteText,
              verified && audit ? [audit.id] : [quote.id],
            ),
          ]
        : [],
    uncertaintyLevel: verified && quote && receipt ? "LOW" : "HIGH",
    summary: `[Mock] ${rider ? "Rider: accepted-price protection" : "Driver: legitimate-extra protection"}. ${quoteText} ${receiptText} ${auditText}`,
    unresolvedQuestions:
      verified && available.length === 3
        ? []
        : [
            "Which charged extras are explicitly permitted by the complete verified pricing record?",
          ],
  };
}

export function fareMockNeutral(messages: ProviderMessage[]) {
  const content = messages.find((m) => m.role === "user")?.content ?? "";
  const section = (name: string): unknown => {
    const raw = content
      .split(`=== ${name} ===`)[1]
      ?.split(/\n=== |\nProduce your structured/)[0]
      ?.trim();
    return raw ? JSON.parse(raw) : null;
  };
  const evidence = section("EVIDENCE SNAPSHOT") as Array<{
    evidenceId: string;
    type: string;
  }>;
  const evaluation = section("DETERMINISTIC POLICY RECOMMENDATION") as {
    outcome: string;
    rationale: string;
    sufficiencyState: string;
  };
  const ids = evidence
    .filter((e) => e.type.startsWith("FARE_"))
    .map((e) => e.evidenceId);
  const sufficient = evaluation.sufficiencyState === "SUFFICIENT";
  return {
    agreements: [
      {
        point:
          "The accepted quote and itemized charge are the pricing records to reconcile.",
        citedEvidenceIds: ids,
        note: "Synthetic evidence; no external provenance claim.",
      },
    ],
    disagreements: [
      {
        point: "Whether every charged extra was permitted.",
        riderPosition: "Protect the accepted fixed price.",
        driverPosition: "Retain explicitly permitted extras.",
        citedEvidenceIds: ids,
        note: "The verified pricing audit, rather than route length, determines permitted extras.",
      },
    ],
    unresolvedQuestions: sufficient
      ? []
      : [
          "Complete or resolve the verified pricing evidence before any monetary recommendation.",
        ],
    sufficiencyAssessment: sufficient
      ? "Pricing evidence satisfies category-specific reconciliation requirements."
      : "Pricing evidence does not satisfy category-specific reconciliation requirements.",
    policyAssessment: `Deterministic outcome: ${evaluation.outcome}.`,
    recommendationExplanation: `[Mock] ${evaluation.rationale}`,
    citedEvidenceIds: ids,
    uncertaintyLevel: sufficient ? "LOW" : "HIGH",
  };
}
