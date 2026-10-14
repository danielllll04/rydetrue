/**
 * Zod schemas for agent outputs.
 *
 * Every agent response is validated against these schemas. If validation
 * fails, the agent's finding is rejected and the case is escalated for
 * human review.
 *
 * Key safety property: `citedEvidenceIds` must contain only evidence IDs
 * that exist in the investigation's evidence snapshot. This is checked by
 * the orchestrator after schema validation.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

/** A point made by an agent, backed by specific evidence. */
const evidencePointSchema = z.object({
  claim: z.string().min(1).max(500),
  citedEvidenceIds: z.array(z.string().min(1)).min(1),
  note: z.string().max(500),
});

/** Uncertainty level reported by the agent. */
const uncertaintyLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

// ---------------------------------------------------------------------------
// Advocate agent output (Rider Advocate, Driver Advocate)
// ---------------------------------------------------------------------------

export const advocateFindingSchema = z.object({
  agentRole: z.enum(["RIDER_ADVOCATE", "DRIVER_ADVOCATE"]),
  party: z.enum(["RIDER", "DRIVER"]),
  supportingPoints: z.array(evidencePointSchema),
  weakeningPoints: z.array(evidencePointSchema),
  uncertaintyLevel: uncertaintyLevelSchema,
  summary: z.string().min(1).max(2000),
  unresolvedQuestions: z.array(z.string().max(500)),
});

export type AdvocateFinding = z.infer<typeof advocateFindingSchema>;

// ---------------------------------------------------------------------------
// Neutral Resolution agent output
// ---------------------------------------------------------------------------

export const neutralResolutionSchema = z.object({
  agreements: z.array(
    z.object({
      point: z.string().min(1).max(500),
      citedEvidenceIds: z.array(z.string().min(1)),
      note: z.string().max(500),
    })
  ),
  disagreements: z.array(
    z.object({
      point: z.string().min(1).max(500),
      riderPosition: z.string().max(500),
      driverPosition: z.string().max(500),
      citedEvidenceIds: z.array(z.string().min(1)),
      note: z.string().max(500),
    })
  ),
  unresolvedQuestions: z.array(z.string().max(500)),
  sufficiencyAssessment: z.string().max(1000),
  policyAssessment: z.string().max(1000),
  recommendationExplanation: z.string().min(1).max(3000),
  citedEvidenceIds: z.array(z.string().min(1)),
  uncertaintyLevel: uncertaintyLevelSchema,
});

export type NeutralResolution = z.infer<typeof neutralResolutionSchema>;

// ---------------------------------------------------------------------------
// Parsed LLM response (tool call or final answer)
// ---------------------------------------------------------------------------

export const toolCallResponseSchema = z.object({
  tool_calls: z.array(
    z.object({
      name: z.string().min(1),
      arguments: z.record(z.string(), z.unknown()),
    })
  ),
});

export const finalAnswerResponseSchema = z.object({
  final_answer: z.record(z.string(), z.unknown()),
});

export type ToolCallResponse = z.infer<typeof toolCallResponseSchema>;
export type FinalAnswerResponse = z.infer<typeof finalAnswerResponseSchema>;
