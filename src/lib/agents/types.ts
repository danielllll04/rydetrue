/**
 * Shared types for the agent layer.
 *
 * These types define the contract between the orchestrator, agents, and
 * the LLM provider. They are implementation-agnostic — no provider-specific
 * details leak here.
 */

// ---------------------------------------------------------------------------
// Provider message types
// ---------------------------------------------------------------------------

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ProviderMessage {
  applicationPrefetch?: boolean;
  role: MessageRole;
  content: string;
  /** For "tool" role messages — the ID of the tool call this responds to. */
  toolCallId?: string;
  /** For "assistant" role messages — tool calls requested by the model. */
  toolCalls?: ToolCallRequest[];
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON-schema-like description of expected arguments. */
  parameters: {
    type: "object";
    properties: Record<
      string,
      { type: string; description: string; enum?: string[] }
    >;
    required?: string[];
  };
}

// ---------------------------------------------------------------------------
// Provider response
// ---------------------------------------------------------------------------

export type FinishReason = "stop" | "tool_calls" | "length" | "error";

export interface ProviderResponse {
  /** Raw text content from the model. */
  content: string;
  /** Tool calls parsed from the model response, if any. */
  toolCalls?: ToolCallRequest[];
  finishReason: FinishReason;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface ProviderOptions {
  prefetchedEvidence?: {
    ids: string[];
    requests: Array<{ name: string; arguments: Record<string, unknown> }>;
    results: ToolResult[];
  };
  telemetry?: {
    investigationId: string;
    agentRole: "RIDER_ADVOCATE" | "DRIVER_ADVOCATE" | "NEUTRAL_RESOLUTION";
    logicalRequestId?: string;
  };
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

export interface ToolResult {
  toolCallId: string;
  name: string;
  /** Structured result data (will be JSON-stringified for the model). */
  result: unknown;
  /** If the tool failed, a human-readable error. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Evidence snapshot (frozen view of evidence at investigation start)
// ---------------------------------------------------------------------------

export interface EvidenceSnapshotEntry {
  evidenceId: string;
  refGroup: string;
  type: string;
  source: string;
  version: number;
  hash: string;
  capturedAt: string;
  payload: unknown;
}

export interface EvidenceSnapshot {
  investigationId: string;
  caseCode: string;
  entries: EvidenceSnapshotEntry[];
  /** Hash of the entire snapshot for drift detection. */
  snapshotHash: string;
}

// ---------------------------------------------------------------------------
// Agent execution status
// ---------------------------------------------------------------------------

export type AgentStatus = "COMPLETED" | "FAILED" | "SKIPPED" | "ESCALATED";

export interface AgentExecutionResult<T> {
  reusedFromInvestigationId?: string;
  status: AgentStatus;
  finding: T | null;
  error: string | null;
  toolCallsUsed: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Investigation status
// ---------------------------------------------------------------------------

export type InvestigationStatus =
  "COMPLETED" | "PARTIAL" | "FAILED" | "ESCALATED";

export interface InvestigationResult {
  investigationId: string;
  caseCode: string;
  status: InvestigationStatus;
  agents: {
    riderAdvocate: AgentExecutionResult<unknown>;
    driverAdvocate: AgentExecutionResult<unknown>;
    neutralResolution: AgentExecutionResult<unknown>;
  };
  evidenceSnapshot: EvidenceSnapshotEntry[];
  sufficiency: {
    state: string;
    reasons: string[];
    missingRequirements: string[];
  };
  policyRecommendation: {
    outcome: string;
    refundCents: number;
    matchedRuleId: string | null;
    approvalState: string;
    rationale: string;
    policyCode: string;
    policyVersion: number;
    recommendationId: string | null;
  };
  humanApprovalRequired: boolean;
  escalationReason: string | null;
}
