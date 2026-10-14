import type { DemoCase, Evidence, Investigation, Stage } from "./types";
export const evidence: Evidence[] = [
  {
    id: "E-001",
    title: "Trip & cancellation record",
    source: "Platform record",
    time: "14:32",
    kind: "trip",
    description: "S$5 fee applied after cancellation",
    detail:
      "Synthetic trip RYD-88421. Pickup: Changi Airport, Terminal 3, Door 6. Driver marked arrived at 14:26; trip cancelled at 14:32. This record confirms a charge, but not the driver’s precise entrance.",
  },
  {
    id: "E-002",
    title: "Driver location snapshot",
    source: "Location record",
    time: "14:26",
    kind: "location",
    description: "Near Terminal 3 · entrance unverified",
    detail:
      "Synthetic GPS fix places the driver within the Terminal 3 pickup area, with an accuracy radius of 120 m. This is insufficient to distinguish Door 6 from Door 8. A nearby location alone does not establish arrival at the agreed entrance.",
  },
  {
    id: "E-003",
    title: "In-app conversation",
    source: "Rider & driver",
    time: "14:28",
    kind: "message",
    description: "Both parties report waiting",
    detail:
      "Synthetic transcript: Rider, 14:28: “I’m outside Door 6. I can’t see your car.” Driver, 14:29: “I am at the pickup area, waiting.” No entrance is identified by the driver in the conversation.",
  },
  {
    id: "E-004",
    title: "Pickup entrance confirmation",
    source: "New synthetic evidence",
    time: "15:04",
    kind: "new",
    description: "Driver’s photo identifies Door 8",
    detail:
      "Synthetic follow-up photo and timestamp place the driver at Door 8 at 14:27. The agreed pickup was Door 6. Combined with E-001 and E-003, this supports an entrance mismatch. In this demo the fixture is prevalidated; no real photo analysis or metadata verification runs.",
  },
];
export const investigations: Record<Stage, Investigation> = {
  initial: {
    stage: "initial",
    sufficiency: 42,
    label: "Insufficient evidence",
    recommendation: "Hold for additional evidence",
    explanation:
      "Both accounts are plausible. The location record confirms proximity to Terminal 3, but cannot establish which pickup entrance the driver used.",
    policy: "DEMO-CXL-02 §2.1 · Arrival verification required",
    findings: [
      {
        role: "rider",
        title: "Rider Advocate",
        finding:
          "The rider reported waiting at Door 6. The conversation supports their account, but does not independently establish the driver’s location.",
        refs: ["E-001", "E-003"],
      },
      {
        role: "driver",
        title: "Driver Advocate",
        finding:
          "The arrival timestamp and GPS support waiting near Terminal 3. GPS accuracy cannot confirm arrival at the agreed entrance.",
        refs: ["E-001", "E-002"],
      },
      {
        role: "neutral",
        title: "Neutral Resolution",
        finding:
          "The key fact is unresolved: were both parties at Door 6? Request entrance-level evidence before recommending a refund or retaining the fee.",
        refs: ["E-002", "E-003"],
      },
    ],
  },
  reinvestigation: {
    stage: "reinvestigation",
    sufficiency: 91,
    label: "Sufficient for review",
    recommendation: "Recommend a S$5.00 refund",
    explanation:
      "New entrance-level evidence places the driver at Door 8, while the agreed pickup was Door 6. This resolves the location conflict and changes the fictional policy evaluation.",
    policy: "DEMO-CXL-02 §2.2 · Incorrect pickup entrance",
    findings: [
      {
        role: "rider",
        title: "Rider Advocate",
        finding:
          "Door 6 was the agreed pickup. The rider’s contemporaneous message and the new entrance confirmation support the claim that the driver did not arrive there.",
        refs: ["E-001", "E-003", "E-004"],
      },
      {
        role: "driver",
        title: "Driver Advocate",
        finding:
          "The driver did wait near Terminal 3. New evidence identifies Door 8, explaining the driver’s account without establishing arrival at Door 6.",
        refs: ["E-002", "E-004"],
      },
      {
        role: "neutral",
        title: "Neutral Resolution",
        finding:
          "The entrance mismatch is now supported. Under the fictional policy, waiting at another entrance does not meet the arrival condition. Recommend refund, subject to human approval.",
        refs: ["E-001", "E-003", "E-004"],
      },
    ],
  },
};
export const cases: DemoCase[] = [
  {
    id: "RT-001",
    route: "Changi Airport T3 → Tampines",
    amount: 5,
    category: "Cancellation fee",
    status: "Needs review",
    priority: "High",
    updated: "4 min ago",
  },
  {
    id: "RT-002",
    route: "Orchard Road → Queenstown",
    amount: 3.5,
    category: "Fare adjustment",
    status: "Investigating",
    priority: "Normal",
    updated: "18 min ago",
  },
  {
    id: "RT-003",
    route: "Marina Bay → Bukit Timah",
    amount: 5,
    category: "Cancellation fee",
    status: "Awaiting response",
    priority: "Normal",
    updated: "32 min ago",
  },
  {
    id: "RT-004",
    route: "Punggol → Sengkang",
    amount: 2,
    category: "Fare adjustment",
    status: "Resolved",
    priority: "Normal",
    updated: "1 hr ago",
  },
];
