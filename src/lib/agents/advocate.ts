/**
 * Advocate Agent — shared logic for Rider Advocate and Driver Advocate.
 *
 * Each advocate:
 *  1. Receives a system prompt defining its role and available tools
 *  2. Engages in a multi-turn tool-calling conversation with the LLM
 *  3. Retrieves case evidence through allowlisted tools
 *  4. Produces a structured finding with verifiable evidence IDs
 *
 * Safety properties enforced here:
 *  - Max tool-call limit (MAX_TOOL_CALLS = 8)
 *  - All tool calls are validated against the evidence snapshot
 *  - Final output is validated against advocateFindingSchema
 *  - Cited evidence IDs must exist in the snapshot
 *  - No chain-of-thought is stored — only the structured finding
 *  - Provider failures are caught and escalated
 */

import { LLMProvider, ProviderError, ProviderTimeoutError } from "./provider";
import {
  ProviderMessage,
  ToolCallRequest,
  ToolResult,
  EvidenceSnapshot,
  AgentExecutionResult,
  ProviderOptions,
} from "./types";
import {
  EVIDENCE_TOOLS,
  EVIDENCE_TOOL_NAMES,
  executeTool,
  validateCitations,
  ToolContext,
} from "./tools";
import { advocateFindingSchema, AdvocateFinding } from "./schemas";
import { toolCallResponseSchema, finalAnswerResponseSchema } from "./schemas";

const MAX_TOOL_CALLS = 8;
const PROVIDER_TIMEOUT_MS = 30_000;

export interface AdvocateConfig {
  role: "RIDER_ADVOCATE" | "DRIVER_ADVOCATE";
  systemPrompt: string;
}

/**
 * Run an advocate agent investigation.
 *
 * @param provider - LLM provider (real or mock)
 * @param config - Agent role and system prompt
 * @param toolContext - Case-scoped tool context (evidence snapshot + metadata)
 * @returns Execution result with finding or error
 */
export async function runAdvocate(
  provider: LLMProvider,
  config: AdvocateConfig,
  toolContext: ToolContext,
): Promise<AgentExecutionResult<AdvocateFinding>> {
  const startTime = Date.now();
  let toolCallsUsed = 0;

  // Build initial conversation.
  const messages: ProviderMessage[] = [
    { role: "system", content: config.systemPrompt },
    {
      role: "user",
      content:
        `Investigate the ${config.role === "RIDER_ADVOCATE" ? "rider" : "driver"}'s ` +
        `claim in case ${toolContext.snapshot.caseCode}. ` +
        `Use the available tools to retrieve evidence, then produce your finding.`,
    },
  ];

  try {
    // Groq can receive the same complete, allowlisted case retrieval without
    // spending model requests on deterministic read planning. Each advocate
    // retrieves its own inputs; no other agent's finding is shared here.
    let prefetchedEvidence: ProviderOptions["prefetchedEvidence"];
    if (
      provider.prefetchEvidence &&
      toolContext.snapshot.entries.length + 3 <= MAX_TOOL_CALLS
    ) {
      const requests = [
        { name: "list_evidence", arguments: {} },
        { name: "get_statements", arguments: {} },
        { name: "get_trip_info", arguments: {} },
        ...toolContext.snapshot.entries.map((e) => ({
          name: "get_evidence_detail",
          arguments: { refGroup: e.refGroup },
        })),
      ];
      const results = requests.map((request, index) =>
        executeTool(
          `prefetch_${index}`,
          request.name,
          request.arguments,
          toolContext,
        ),
      );
      if (results.some((result) => result.error))
        throw new ProviderError(
          "Application evidence prefetch failed.",
          "EVIDENCE_RETRIEVAL_FAILED",
        );
      toolCallsUsed = results.length;
      prefetchedEvidence = {
        ids: toolContext.snapshot.entries.map((e) => e.evidenceId),
        requests,
        results,
      };
      messages.push({
        role: "user",
        applicationPrefetch: true,
        content:
          "The application has executed the case-scoped evidence tools for your independent investigation. These are actual tool results, not agent findings. Review all results and produce your final_answer JSON.\n" +
          JSON.stringify(results),
      });
    }
    // --- Multi-turn tool-calling loop ---
    for (let turn = 0; turn < MAX_TOOL_CALLS; turn++) {
      const response = await provider.chat(messages, {
        timeoutMs: PROVIDER_TIMEOUT_MS,
        prefetchedEvidence,
        telemetry: {
          investigationId: toolContext.snapshot.investigationId,
          agentRole: config.role,
        },
      });

      // Try to parse the response as tool calls or final answer.
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(response.content);
      } catch {
        // Not valid JSON — the model didn't follow the protocol.
        return {
          status: "FAILED",
          finding: null,
          error: `Agent response was not valid JSON. Content (first 200 chars): ${response.content.slice(0, 200)}`,
          toolCallsUsed,
          durationMs: Date.now() - startTime,
        };
      }

      // Check for tool calls.
      const toolCallResult = safeParse(toolCallResponseSchema, parsed);
      if (toolCallResult && toolCallResult.tool_calls.length > 0) {
        // --- Execute tool calls ---
        // Add assistant message with tool calls to conversation.
        const assistantToolCalls: ToolCallRequest[] =
          toolCallResult.tool_calls.map((tc, i) => ({
            id: `tc_${turn}_${i}`,
            name: tc.name,
            arguments: tc.arguments,
          }));

        messages.push({
          role: "assistant",
          content: response.content,
          toolCalls: assistantToolCalls,
        });

        // Execute each tool call.
        for (const tc of assistantToolCalls) {
          const result = executeTool(tc.id, tc.name, tc.arguments, toolContext);
          messages.push({
            role: "tool",
            content: JSON.stringify(
              result.error ? { error: result.error } : result.result,
            ),
            toolCallId: tc.id,
          });
          toolCallsUsed++;
        }

        // Enforce max tool calls.
        if (toolCallsUsed >= MAX_TOOL_CALLS) {
          // Force a final answer on the next turn.
          messages.push({
            role: "user",
            content:
              "You have reached the maximum number of tool calls. " +
              "Please provide your final answer now using the final_answer format.",
          });
        }
        continue;
      }

      // Check for final answer.
      const finalResult = safeParse(finalAnswerResponseSchema, parsed);
      if (finalResult) {
        // Validate the finding against the Zod schema.
        const findingResult = advocateFindingSchema.safeParse(
          finalResult.final_answer,
        );
        if (!findingResult.success) {
          return {
            status: "FAILED",
            finding: null,
            error: `Agent output failed schema validation: ${findingResult.error.message}`,
            toolCallsUsed,
            durationMs: Date.now() - startTime,
          };
        }

        const finding = findingResult.data;

        // Verify the agent role matches.
        if (finding.agentRole !== config.role) {
          return {
            status: "FAILED",
            finding: null,
            error: `Agent role mismatch: expected ${config.role}, got ${finding.agentRole}`,
            toolCallsUsed,
            durationMs: Date.now() - startTime,
          };
        }

        // Validate all cited evidence IDs against the snapshot.
        const allCitedIds = new Set<string>();
        for (const pt of finding.supportingPoints) {
          for (const id of pt.citedEvidenceIds) allCitedIds.add(id);
        }
        for (const pt of finding.weakeningPoints) {
          for (const id of pt.citedEvidenceIds) allCitedIds.add(id);
        }

        const citationCheck = validateCitations(
          [...allCitedIds],
          toolContext.snapshot,
        );
        if (!citationCheck.valid) {
          return {
            status: "FAILED",
            finding: null,
            error: `Agent cited fabricated evidence IDs: ${citationCheck.invalid.join(", ")}`,
            toolCallsUsed,
            durationMs: Date.now() - startTime,
          };
        }

        return {
          status: "COMPLETED",
          finding,
          error: null,
          toolCallsUsed,
          durationMs: Date.now() - startTime,
        };
      }

      // Neither tool calls nor final answer.
      return {
        status: "FAILED",
        finding: null,
        error: `Agent response was neither a tool call nor a final answer. Content (first 200 chars): ${response.content.slice(0, 200)}`,
        toolCallsUsed,
        durationMs: Date.now() - startTime,
      };
    }

    // If we exit the loop, the agent made too many tool calls without a final answer.
    return {
      status: "FAILED",
      finding: null,
      error: `Agent exceeded maximum tool calls (${MAX_TOOL_CALLS}) without producing a final answer.`,
      toolCallsUsed,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    // Provider failure — escalate.
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
      toolCallsUsed,
      durationMs: Date.now() - startTime,
    };
  }
}

/** Safe parse helper that returns null on failure instead of throwing. */
function safeParse<T>(
  schema: { safeParse: (data: unknown) => { success: boolean; data?: T } },
  data: unknown,
): T | null {
  const result = schema.safeParse(data);
  return result.success ? (result.data ?? null) : null;
}

// Re-export for the neutral agent.
export { MAX_TOOL_CALLS as MAX_TOOL_CALLS_ADVOCATE };
export type { AdvocateFinding };
