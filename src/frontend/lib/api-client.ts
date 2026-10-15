import { z } from "zod";
import type { SubmitEvidenceRequest, ApproveRequest } from "@/lib/schemas";
import {
  caseDetailSchema,
  caseSummarySchema,
  investigationResultSchema,
  policySchema,
} from "./api-types";
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
type Transport = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export function createApiClient(
  transport: Transport = (...args) => fetch(...args),
) {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    timeout = 25000,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await transport(path, {
        method: body === undefined ? "GET" : "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new ApiError(
          response.status,
          "invalid_response",
          "The API did not return JSON. Check the service and refresh.",
        );
      }
      if (!response.ok) {
        const error = z
          .object({
            error: z.string().optional(),
            escalationReason: z.string().nullable().optional(),
          })
          .passthrough()
          .safeParse(data);
        const code = error.success
          ? error.data.error || "investigation_failed"
          : "api_error";
        const messages: Record<string, string> = {
          demo_session_expired:
            "This temporary demo session expired or the server restarted. Refresh data to start a fresh session.",
          demo_capacity_reached:
            "The free demo is busy. Wait one minute and retry; active sessions expire after 30 minutes.",
          demo_rate_limited:
            "The demo is busy or its request limit was reached. Wait one minute and retry.",
          demo_mutation_limit:
            "This session reached its write limit. Start a new demo session to continue.",
          demo_busy:
            "An operation is already running. Refresh before retrying.",
          public_demo_fixture_only:
            "The public demo accepts only the supplied synthetic evidence. Use Submit independent evidence to continue.",
          demo_evidence_already_submitted:
            "This independent evidence is already recorded. Refresh before reinvestigating.",
          case_not_found: "This case was not found.",
          already_actioned:
            "This recommendation has already been actioned. Refresh before continuing.",
          evidence_integrity_failed:
            "Evidence integrity verification failed. Human review is required.",
          invalid_request:
            "The API rejected this request. Check the fields and try again.",
          invalid_evidence_payload:
            "The evidence payload does not match the documented schema.",
          policy_not_found:
            "No policy is effective for the selected case and time.",
          investigation_in_progress:
            "An investigation is already running for this case. Refresh before retrying.",
          retry_context_mismatch:
            "The retry inputs or stored findings changed. Run a fresh investigation.",
        };
        throw new ApiError(
          response.status,
          code,
          messages[code] ||
            `The API operation failed (${response.status}, ${code}). No success has been assumed.`,
        );
      }
      const parsed = schema.safeParse(data);
      if (!parsed.success)
        throw new ApiError(
          response.status,
          "contract_mismatch",
          "The API response does not match the documented contract. No fixture data has been substituted.",
        );
      return parsed.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted)
        throw new ApiError(
          0,
          "timeout",
          "The request timed out. Refresh the case before repeating a write; the server may still be processing it.",
        );
      throw new ApiError(
        0,
        "network",
        "The API could not be reached. Refresh before retrying a write.",
      );
    } finally {
      clearTimeout(timer);
    }
  }
  const pathFor = (id: string) => `/api/cases/${encodeURIComponent(id)}`;
  let sessionRequest: Promise<unknown> | undefined;
  return {
    ensureDemoSession() {
      sessionRequest ??= request(
        "/api/demo/session",
        z.object({ provider: z.literal("mock"), temporary: z.literal(true) }),
        {},
      ).finally(() => {
        sessionRequest = undefined;
      });
      return sessionRequest;
    },
    resetDemoSession() {
      return request(
        "/api/demo/reset",
        z.object({ provider: z.literal("mock"), temporary: z.literal(true) }),
        {},
      );
    },
    async listCases() {
      return (
        await request(
          "/api/cases",
          z.object({ cases: z.array(caseSummarySchema) }),
        )
      ).cases;
    },
    getCase(id: string) {
      return request(pathFor(id), caseDetailSchema);
    },
    async listPolicies() {
      return (
        await request(
          "/api/policies",
          z.object({ policies: z.array(policySchema) }),
        )
      ).policies;
    },
    submitEvidence(id: string, body: SubmitEvidenceRequest) {
      return request(
        `${pathFor(id)}/evidence`,
        z.object({
          caseCode: z.string(),
          evidence: z.object({
            id: z.string(),
            type: z.string(),
            source: z.string(),
            refGroup: z.string(),
            version: z.number(),
            hash: z.string(),
            capturedAt: z.string(),
            notes: z.string().nullable(),
          }),
        }),
        body,
      );
    },
    evaluate(id: string, policyCode: string) {
      return request(
        `${pathFor(id)}/evaluate`,
        z.object({
          caseCode: z.string(),
          recommendation: z
            .object({
              id: z.string(),
              outcome: z.string(),
              refundCents: z.number().int(),
            })
            .passthrough(),
          sufficiency: z.object({
            state: z.string(),
            reasons: z.array(z.string()),
            missingRequirements: z.array(z.string()),
          }),
        }),
        { policyCode, actor: "reviewer:integration-demo" },
      );
    },
    investigate(id: string, policyCode: string, retryInvestigationId?: string) {
      return request(
        `${pathFor(id)}/investigate`,
        investigationResultSchema,
        {
          policyCode,
          actor: "reviewer:integration-demo",
          ...(retryInvestigationId ? { retryInvestigationId } : {}),
        },
        240000,
      );
    },
    approve(id: string, recId: string, body: ApproveRequest) {
      return request(
        `${pathFor(id)}/recommendations/${encodeURIComponent(recId)}/approve`,
        z.object({
          caseCode: z.string(),
          recommendation: z
            .object({
              id: z.string(),
              approvalState: z.enum(["APPROVED", "REJECTED"]),
              simulated: z.literal(true),
            })
            .passthrough(),
        }),
        body,
      );
    },
  };
}
export const apiClient = createApiClient();
