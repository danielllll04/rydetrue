import { FARE_POLICY_CODE, FARE_POLICY_RULES } from "./fare-policy";
export const RT_002_CASE_CODE = "RT-002";
export const RT_002_TRIP = {
  caseCode: RT_002_CASE_CODE,
  city: "Singapore",
  status: "COMPLETED",
  requestedAt: new Date("2026-10-15T00:00:00Z"),
  acceptedAt: new Date("2026-10-15T00:01:00Z"),
  cancelledAt: null,
  pickupLabel: "Raffles Place — synthetic pickup",
  pickupLat: 1.2839,
  pickupLng: 103.8515,
  dropoffLabel: "Changi Airport — synthetic destination",
  dropoffLat: 1.3546,
  dropoffLng: 103.9873,
  fareAmountCents: 2900,
  currency: "SGD",
  cancellationFeeCents: null,
};
export const RT_002_STATEMENTS = [
  {
    role: "RIDER",
    authorAlias: "Rider C.",
    text: "I accepted a fixed fare of SGD 20.00. The receipt charged SGD 29.00 including a toll and a route adjustment. I dispute the route adjustment and ask for the charge to be checked against the agreed fare and permitted extras.",
  },
  {
    role: "DRIVER",
    authorAlias: "Driver D.",
    text: "The completed trip included a toll and traffic-related rerouting. I believe the extras were legitimate. Please check the itemized receipt and authorization records; the route alone does not establish what is payable.",
  },
] as const;
export const RT_002_QUOTE = {
  type: "FARE_QUOTE",
  caseCode: RT_002_CASE_CODE,
  currency: "SGD",
  quoteId: "synthetic-quote-002",
  pricingMode: "FIXED_UPFRONT",
  quotedCents: 2000,
  acceptedAt: "2026-10-15T00:01:00Z",
} as const;
export const RT_002_RECEIPT = {
  type: "FARE_RECEIPT",
  caseCode: RT_002_CASE_CODE,
  currency: "SGD",
  quoteId: RT_002_QUOTE.quoteId,
  receiptId: "synthetic-receipt-002",
  baseFareCents: 2000,
  chargedCents: 2900,
  chargedAt: "2026-10-15T00:30:00Z",
  extras: [
    { id: "toll", description: "Synthetic toll", amountCents: 300 },
    {
      id: "route-adjustment",
      description: "Synthetic route adjustment",
      amountCents: 600,
    },
  ],
} as const;
export const RT_002_PRICING_AUDIT = {
  type: "FARE_ADJUSTMENT_RECORD",
  caseCode: RT_002_CASE_CODE,
  currency: "SGD",
  quoteId: RT_002_QUOTE.quoteId,
  receiptId: RT_002_RECEIPT.receiptId,
  providerName: "Synthetic independent pricing review",
  verification: "VERIFIED",
  complete: true,
  reviewedAt: "2026-10-15T00:35:00Z",
  extras: [
    {
      id: "toll",
      permitted: true,
      permittedCents: 300,
      reason: "Toll is permitted by the accepted quote's extras terms.",
    },
    {
      id: "route-adjustment",
      permitted: false,
      permittedCents: 0,
      reason:
        "Fixed upfront fare does not authorize this adjustment; no accepted change is recorded in this complete audit.",
    },
  ],
} as const;
export const RT_002_STAGE_1 = [
  {
    refGroup: "accepted-fare-quote",
    source: "PLATFORM",
    payload: RT_002_QUOTE,
    capturedAt: RT_002_QUOTE.acceptedAt,
  },
  {
    refGroup: "charged-fare-receipt",
    source: "PLATFORM",
    payload: RT_002_RECEIPT,
    capturedAt: RT_002_RECEIPT.chargedAt,
  },
  {
    refGroup: "fare-chat",
    source: "PLATFORM",
    payload: {
      type: "CHAT_LOG",
      messages: [
        {
          at: "2026-10-15T00:31:00Z",
          from: "RIDER",
          text: "Please check the quoted fare and authorization for the extra charges.",
        },
      ],
    },
    capturedAt: "2026-10-15T00:31:00Z",
  },
];
export const RT_002_STAGE_2 = {
  type: "FARE_ADJUSTMENT_RECORD" as const,
  source: "THIRD_PARTY" as const,
  refGroup: "verified-pricing-audit",
  payload: RT_002_PRICING_AUDIT,
  capturedAt: RT_002_PRICING_AUDIT.reviewedAt,
};
export const RT_002_POLICY = {
  code: FARE_POLICY_CODE,
  version: 1,
  description:
    "Fictional fixed upfront fare reconciliation. Only verified permitted extras are chargeable; never infer driver fault from route length.",
  ...FARE_POLICY_RULES,
};
