/**
 * Neutral Resolution Agent.
 *
 * Receives findings from both advocates and the verified evidence snapshot.
 * Produces a resolution that:
 *  - Identifies agreements and disagreements between advocates
 *  - Assesses evidence sufficiency
 *  - Explains the deterministic policy recommendation using citations
 *  - CANNOT override the deterministic policy outcome
 *
 * This agent does NOT use tools — all evidence is provided directly in the
 * prompt. It only produces a structured explanation.
 */

import { LLMProvider, ProviderError, ProviderTimeoutError } from "./provider";
import {
  ProviderMessage,
  AgentExecutionResult,
  EvidenceSnapshot,
} from "./types";
import { validateCitations } from "./tools";
import { neutralResolutionSchema, NeutralResolution, finalAnswerResponseSchema } from "./schemas";
import { neutralResolutionPrompt } from "./prompts";
import { AdvocateFinding } from "./schemas";
import { EvaluationResult } from "../policy";
import { SufficiencyResult } from "../sufficiency";

const PROVIDER_TIMEOUT_MS = 30_000;

export interface NeutralResolutionInput {
  riderFinding: AdvocateFinding;
  driverFinding: AdvocateFinding;
  evidenceSnapshot: EvidenceSnapshot;
  sufficiency: SufficiencyResult;
  policyEvaluation: EvaluationResult;
}

/**
 * Run the Neutral Resolution Agent.
 *
 * @param provider - LLM provider (real or mock)
 * @param input - Both advocate findings + evidence + deterministic results
 * @returns Execution result with resolution finding or error
 */
export async function runNeutralResolution(
  provider: LLMProvider,
  input: NeutralResolutionInput
): Promise<AgentExecutionResult<NeutralResolution>> {
  const startTime = Date.now();

  // Build the system prompt.
  const systemPrompt = neutralResolutionPrompt();

  // Build the user message with all context.
  const userMessage = buildUserMessage(input);

  const messages: ProviderMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  try {
    const response = await provider.chat(messages, {
      timeoutMs: PROVIDER_TIMEOUT_MS,
    });

    // Parse the response.
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      return {
        status: "FAILED",
        finding: null,
        error: `Neutral agent response was not valid JSON. Content (first 200 chars): ${response.content.slice(0, 200)}`,
        toolCallsUsed: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Check for final_answer wrapper.
    const finalResult = finalAnswerResponseSchema.safeParse(parsed);
    if (!finalResult.success) {
      // Maybe it's the finding directly without wrapper.
      const directResult = neutralResolutionSchema.safeParse(parsed);
      if (!directResult.success) {
        return {
          status: "FAILED",
          finding: null,
          error: `Neutral agent output failed schema validation: ${directResult.error.message}`,
          toolCallsUsed: 0,
          durationMs: Date.now() - startTime,
        };
      }
      return validateAndReturn(directResult.data, input, startTime);
    }

    const findingResult = neutralResolutionSchema.safeParse(
      finalResult.data.final_answer
    );
    if (!findingResult.success) {
      return {
        status: "FAILED",
        finding: null,
        error: `Neutral agent output failed schema validation: ${findingResult.error.message}`,
        toolCallsUsed: 0,
        durationMs: Date.now() - startTime,
      };
    }

    return validateAndReturn(findingResult.data, input, startTime);
  } catch (err) {
    const message =
      err instanceof ProviderTimeoutError
        ? `Provider timeout: ${err.message}`
        : err instanceof ProviderError
          ? `Provider error (${err.code}): ${err.message}`
          : `Unexpected error: ${(err as Error).message}`;

    return {
      status: "ESCALATED",
      finding: null,
      error: message,
      toolCallsUsed: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

/** Validate the neutral resolution finding and return the execution result. */
function validateAndReturn(
  finding: NeutralResolution,
  input: NeutralResolutionInput,
  startTime: number
): AgentExecutionResult<NeutralResolution> {
  // Validate all cited evidence IDs.
  const allCitedIds = new Set<string>();
  for (const a of finding.agreements) {
    for (const id of a.citedEvidenceIds) allCitedIds.add(id);
  }
  for (const d of finding.disagreements) {
    for (const id of d.citedEvidenceIds) allCitedIds.add(id);
  }
  for (const id of finding.citedEvidenceIds) allCitedIds.add(id);

  const citationCheck = validateCitations(
    [...allCitedIds],
    input.evidenceSnapshot
  );
  if (!citationCheck.valid) {
    return {
      status: "FAILED",
      finding: null,
      error: `Neutral agent cited fabricated evidence IDs: ${citationCheck.invalid.join(", ")}`,
      toolCallsUsed: 0,
      durationMs: Date.now() - startTime,
    };
  }

  return {
    status: "COMPLETED",
    finding,
    error: null,
    toolCallsUsed: 0,
    durationMs: Date.now() - startTime,
  };
}

/** Build the user message with all context for the neutral agent. */
function buildUserMessage(input: NeutralResolutionInput): string {
  const parts: string[] = [];

  parts.push("=== RIDER ADVOCATE FINDING ===");
  parts.push(JSON.stringify(input.riderFinding, null, 2));

  parts.push("\n=== DRIVER ADVOCATE FINDING ===");
  parts.push(JSON.stringify(input.driverFinding, null, 2));

  parts.push("\n=== EVIDENCE SNAPSHOT ===");
  parts.push(
    JSON.stringify(
      input.evidenceSnapshot.entries.map((e) => ({
        evidenceId: e.evidenceId,
        refGroup: e.refGroup,
        type: e.type,
        source: e.source,
        version: e.version,
        hash: e.hash,
        capturedAt: e.capturedAt,
        payload: e.payload,
      })),
      null,
      2
    )
  );

  parts.push("\n=== DETERMINISTIC SUFFICIENCY STATE ===");
  parts.push(JSON.stringify(input.sufficiency, null, 2));

  parts.push("\n=== DETERMINISTIC POLICY RECOMMENDATION ===");
  parts.push(
    JSON.stringify(
      {
        outcome: input.policyEvaluation.outcome,
        sufficiencyState: input.policyEvaluation.sufficiencyState,
        refundCents: input.policyEvaluation.refundCents,
        matchedRuleId: input.policyEvaluation.matchedRuleId,
        rationale: input.policyEvaluation.rationale,
        policyCode: input.policyEvaluation.policyCode,
        policyVersion: input.policyEvaluation.policyVersion,
        citations: input.policyEvaluation.citations,
        metrics: input.policyEvaluation.metrics,
      },
      null,
      2
    )
  );

  parts.push(
    "\nProduce your structured resolution. Remember: you MUST agree with " +
      "the deterministic policy outcome. Your role is to explain it, not override it."
  );

  return parts.join("\n");
}

// Re-export for orchestrator.
export type { NeutralResolution };
