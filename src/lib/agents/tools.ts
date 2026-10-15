/**
 * Case-scoped, allowlisted evidence retrieval tools.
 *
 * These tools are the ONLY way agents can access case data. They enforce:
 *  - Case scoping: all data comes from the evidence snapshot for THIS case
 *  - Allowlisting: only the 4 defined tools can be called
 *  - ID validation: agents cannot access evidence by fabricated IDs
 *  - Sanitization: raw DB records are never exposed; only structured data
 *
 * Security note: all evidence content (statements, GPS data, chat logs) is
 * treated as UNTRUSTED INPUT. Tool results are structured JSON — they do
 * not execute code, modify data, or influence policy evaluation.
 */

import { EvidenceSnapshot, ToolDefinition, ToolResult } from "./types";

// ---------------------------------------------------------------------------
// Tool definitions (shared with agent prompts)
// ---------------------------------------------------------------------------

export const EVIDENCE_TOOLS: ToolDefinition[] = [
  {
    name: "list_evidence",
    description:
      "List all evidence groups available in this case. Returns metadata " +
      "(refGroup, type, source, version, hash, capturedAt) but NOT the raw " +
      "payload. Use this first to see what evidence exists.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_evidence_detail",
    description:
      "Get the full payload for a specific evidence group. Provide the " +
      "refGroup (e.g. 'rider-gps', 'driver-gps', 'trip-telemetry').",
    parameters: {
      type: "object",
      properties: {
        refGroup: {
          type: "string",
          description: "The refGroup of the evidence to retrieve.",
        },
      },
      required: ["refGroup"],
    },
  },
  {
    name: "get_statements",
    description:
      "Get the rider and driver statements (verbatim text submitted by " +
      "each party).",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_trip_info",
    description:
      "Get trip metadata: pickup location, dropoff, fare, cancellation fee, " +
      "trip status, and timestamps.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

export const EVIDENCE_TOOL_NAMES = EVIDENCE_TOOLS.map((t) => t.name);

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

export interface ToolContext {
  snapshot: EvidenceSnapshot;
  statements: Array<{
    role: string;
    authorAlias: string;
    text: string;
    submittedAt: string;
  }>;
  tripInfo: {
    caseCode: string;
    category?: string;
    city: string;
    status: string;
    pickupLabel: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLabel: string;
    dropoffLat: number;
    dropoffLng: number;
    fareAmountCents: number;
    currency: string;
    cancellationFeeCents: number | null;
    requestedAt: string;
    acceptedAt: string | null;
    cancelledAt: string | null;
  };
}

/**
 * Execute a tool call against the case snapshot.
 * Returns a structured result or an error.
 *
 * This is the ONLY path from agent to case data. All access is validated
 * against the frozen evidence snapshot.
 */
export function executeTool(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): ToolResult {
  // Allowlist check
  if (!EVIDENCE_TOOL_NAMES.includes(toolName)) {
    return {
      toolCallId,
      name: toolName,
      result: null,
      error: `Unknown tool: ${toolName}. Available tools: ${EVIDENCE_TOOL_NAMES.join(", ")}`,
    };
  }

  switch (toolName) {
    case "list_evidence":
      return {
        toolCallId,
        name: toolName,
        result: ctx.snapshot.entries.map((e) => ({
          evidenceId: e.evidenceId,
          refGroup: e.refGroup,
          type: e.type,
          source: e.source,
          version: e.version,
          hash: e.hash,
          capturedAt: e.capturedAt,
        })),
      };

    case "get_evidence_detail": {
      const refGroup = args.refGroup;
      if (typeof refGroup !== "string" || !refGroup) {
        return {
          toolCallId,
          name: toolName,
          result: null,
          error: "Missing required argument: refGroup (string)",
        };
      }
      const entry = ctx.snapshot.entries.find(
        (e) => e.refGroup === refGroup
      );
      if (!entry) {
        return {
          toolCallId,
          name: toolName,
          result: null,
          error: `No evidence found for refGroup '${refGroup}'. Use list_evidence to see available groups.`,
        };
      }
      return {
        toolCallId,
        name: toolName,
        result: {
          evidenceId: entry.evidenceId,
          refGroup: entry.refGroup,
          type: entry.type,
          source: entry.source,
          version: entry.version,
          hash: entry.hash,
          capturedAt: entry.capturedAt,
          payload: entry.payload,
        },
      };
    }

    case "get_statements":
      return {
        toolCallId,
        name: toolName,
        result: ctx.statements,
      };

    case "get_trip_info":
      return {
        toolCallId,
        name: toolName,
        result: ctx.tripInfo,
      };

    default:
      return {
        toolCallId,
        name: toolName,
        result: null,
        error: `Tool '${toolName}' is defined but not implemented.`,
      };
  }
}

/**
 * Validate that all cited evidence IDs exist in the snapshot.
 * Used by the orchestrator after agent output validation.
 */
export function validateCitations(
  citedIds: string[],
  snapshot: EvidenceSnapshot
): { valid: boolean; invalid: string[] } {
  const validIds = new Set(snapshot.entries.map((e) => e.evidenceId));
  const invalid = citedIds.filter((id) => !validIds.has(id));
  return { valid: invalid.length === 0, invalid };
}
