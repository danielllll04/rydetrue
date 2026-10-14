export type View =
  "investigation" | "operations" | "rider" | "driver" | "resolution";
export type Stage = "initial" | "reinvestigation";
export type Decision = "pending" | "approved" | "escalated";
export type EvidenceId = "E-001" | "E-002" | "E-003" | "E-004";
export interface Evidence {
  id: EvidenceId;
  title: string;
  source: string;
  time: string;
  description: string;
  detail: string;
  kind: "trip" | "location" | "message" | "new";
}
export interface Finding {
  role: "rider" | "driver" | "neutral";
  title: string;
  finding: string;
  refs: EvidenceId[];
}
export interface Investigation {
  stage: Stage;
  sufficiency: number;
  label: string;
  findings: Finding[];
  recommendation: string;
  explanation: string;
  policy: string;
}
export interface AuditEvent {
  id: string;
  time: string;
  title: string;
  detail: string;
}
export interface Submission {
  statement: string;
  category: string;
  files: { name: string; size: number; type: string }[];
}
export interface DemoCase {
  id: string;
  route: string;
  amount: number;
  category: string;
  status: string;
  priority: "Normal" | "High";
  updated: string;
}
export interface CaseService {
  listCases(): Promise<DemoCase[]>;
  getInvestigation(stage: Stage): Promise<Investigation>;
  submit(
    role: "rider" | "driver",
    submission: Submission,
  ): Promise<{ reference: string }>;
  review(
    decision: Exclude<Decision, "pending">,
    stage: Stage,
  ): Promise<{ decision: Decision }>;
}
