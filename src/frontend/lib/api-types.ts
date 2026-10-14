import { z } from "zod";
import {
  approvalStateSchema,
  caseStatusSchema,
  outcomeSchema,
  sufficiencyStateSchema,
} from "@/lib/schemas";
export const citationSchema = z.object({
  evidenceId: z.string(),
  ruleId: z.string().nullable().optional(),
  note: z.string(),
});
export const snapshotSchema = z.object({
  evidenceId: z.string(),
  refGroup: z.string(),
  type: z.string(),
  version: z.number().int(),
  hash: z.string(),
});
export const recommendationSchema = z.object({
  id: z.string(),
  outcome: outcomeSchema,
  sufficiencyState: sufficiencyStateSchema,
  refundCents: z.number().int(),
  rationale: z.string(),
  citations: z.array(citationSchema),
  evidenceSnapshot: z.array(snapshotSchema),
  approvalState: approvalStateSchema,
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  policyCode: z.string(),
  policyVersion: z.number(),
  createdAt: z.string(),
  supersededById: z.string().nullable().optional(),
  isCurrent: z.boolean().optional(),
});
export const caseSummarySchema = z.object({
  caseCode: z.string(),
  category: z.string(),
  status: caseStatusSchema,
  openedAt: z.string(),
  city: z.string(),
  cancellationFeeCents: z.number().int().nullable(),
  hasRecommendation: z.boolean(),
  recommendationOutcome: outcomeSchema.nullable(),
  recommendationCount: z.number(),
});
const coordinates = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export const caseDetailSchema = z.object({
  caseCode: z.string(),
  category: z.string(),
  status: caseStatusSchema,
  summary: z.string(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  trip: z.object({
    caseCode: z.string(),
    city: z.string(),
    status: z.string(),
    requestedAt: z.string(),
    acceptedAt: z.string().nullable(),
    cancelledAt: z.string().nullable(),
    pickup: coordinates,
    dropoff: coordinates,
    fareAmountCents: z.number().int(),
    currency: z.string(),
    cancellationFeeCents: z.number().int().nullable(),
  }),
  statements: z.array(
    z.object({
      id: z.string(),
      role: z.string(),
      authorAlias: z.string(),
      text: z.string(),
      submittedAt: z.string(),
    }),
  ),
  evidence: z.object({
    groups: z.array(
      z.object({
        refGroup: z.string(),
        type: z.string(),
        source: z.string(),
        latestVersion: z.number(),
        latestCapturedAt: z.string(),
        latestHash: z.string(),
        historyVersions: z.array(z.number()),
        payload: z.record(z.unknown()),
      }),
    ),
    integrity: z.array(
      z.object({
        id: z.string(),
        refGroup: z.string(),
        type: z.string(),
        version: z.number(),
        hashMatches: z.boolean(),
        recomputedHash: z.string(),
      }),
    ),
  }),
  findings: z.array(
    z.object({
      id: z.string(),
      agent: z.string(),
      summary: z.string(),
      payload: z.record(z.unknown()),
      createdAt: z.string(),
    }),
  ),
  recommendationHistory: z.array(recommendationSchema),
  currentRecommendation: recommendationSchema.nullable(),
  audit: z.array(
    z.object({
      id: z.string(),
      actor: z.string(),
      action: z.string(),
      payload: z.record(z.unknown()),
      createdAt: z.string(),
    }),
  ),
});
export const policySchema = z.object({
  id: z.string(),
  code: z.string(),
  version: z.number(),
  description: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  rules: z.object({
    rules: z.array(
      z.object({ id: z.string(), description: z.string() }).passthrough(),
    ),
    fallback: z.record(z.unknown()),
  }),
});
const agentExecutionSchema = z.object({
  status: z.enum(["COMPLETED", "FAILED", "ESCALATED", "SKIPPED"]),
  finding: z.unknown(),
  error: z.string().nullable(),
  toolCallsUsed: z.number(),
  durationMs: z.number(),
});
export const investigationResultSchema = z.object({
  investigationId: z.string(),
  caseCode: z.string(),
  status: z.enum(["COMPLETED", "PARTIAL", "FAILED", "ESCALATED"]),
  agents: z.object({
    riderAdvocate: agentExecutionSchema,
    driverAdvocate: agentExecutionSchema,
    neutralResolution: agentExecutionSchema,
  }),
  evidenceSnapshot: z.array(snapshotSchema.passthrough()),
  sufficiency: z.object({
    state: sufficiencyStateSchema,
    reasons: z.array(z.string()),
    missingRequirements: z.array(z.string()),
  }),
  policyRecommendation: z.object({
    outcome: outcomeSchema,
    refundCents: z.number().int(),
    matchedRuleId: z.string().nullable(),
    approvalState: approvalStateSchema,
    rationale: z.string(),
    policyCode: z.string(),
    policyVersion: z.number(),
    recommendationId: z.string().nullable(),
  }),
  humanApprovalRequired: z.boolean(),
  escalationReason: z.string().nullable(),
});
export type CaseDetail = z.infer<typeof caseDetailSchema>;
export type CaseSummary = z.infer<typeof caseSummarySchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type PolicyDto = z.infer<typeof policySchema>;
export type InvestigationResultDto = z.infer<typeof investigationResultSchema>;
export type ProviderMode = "mock" | "configured" | "unconfigured";
