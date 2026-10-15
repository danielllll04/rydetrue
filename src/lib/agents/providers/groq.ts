import { TencentCloudProvider } from "./tencent";
import { ProviderError } from "../provider";
import type { ProviderMessage, ProviderOptions } from "../types";
import { EVIDENCE_TOOL_NAMES } from "../tools";
import { randomUUID } from "node:crypto";
import { GroqQuota, retryAfterMs, resetDurationMs } from "../rate-limit";
import { recordProviderMetric } from "../metrics";
import { compactNeutralContext } from "../compact-context";

const quota = new GroqQuota();

const BASE_URL = "https://api.groq.com/openai/v1";
const BATCH_TOOL = "retrieve_evidence_batch";
const evidencePoint = {
  type: "object",
  properties: {
    claim: { type: "string", maxLength: 500 },
    citedEvidenceIds: { type: "array", minItems: 1, items: { type: "string" } },
    note: { type: "string", maxLength: 500 },
  },
  required: ["claim", "citedEvidenceIds", "note"],
  additionalProperties: false,
};
const advocateOutputSchema = {
  type: "object",
  properties: {
    final_answer: {
      type: "object",
      properties: {
        agentRole: {
          type: "string",
          enum: ["RIDER_ADVOCATE", "DRIVER_ADVOCATE"],
        },
        party: { type: "string", enum: ["RIDER", "DRIVER"] },
        supportingPoints: { type: "array", items: evidencePoint },
        weakeningPoints: { type: "array", items: evidencePoint },
        uncertaintyLevel: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH"],
        },
        summary: { type: "string", maxLength: 2000 },
        unresolvedQuestions: {
          type: "array",
          items: { type: "string", maxLength: 500 },
        },
      },
      required: [
        "agentRole",
        "party",
        "supportingPoints",
        "weakeningPoints",
        "uncertaintyLevel",
        "summary",
        "unresolvedQuestions",
      ],
      additionalProperties: false,
    },
  },
  required: ["final_answer"],
  additionalProperties: false,
};
type WireMessage = Record<string, unknown>;

export class GroqProvider extends TencentCloudProvider {
  readonly prefetchEvidence = true;
  readonly configurationIdentity: string;
  protected readonly maxRetryWaitMs = 90000;
  private readonly baseUrlIsValid: boolean;
  private static pending: Promise<unknown> = Promise.resolve();
  constructor() {
    super({
      name: "groq",
      baseUrl: BASE_URL,
      model: process.env.RYDETRUE_LLM_MODEL || "openai/gpt-oss-120b",
      requestOptions: { reasoning_effort: "low" },
    });
    this.baseUrlIsValid =
      !process.env.RYDETRUE_LLM_BASE_URL ||
      process.env.RYDETRUE_LLM_BASE_URL.replace(/\/$/, "") === BASE_URL;
    this.configurationIdentity =
      "groq-prefetch-native-v2|" +
      (process.env.RYDETRUE_LLM_MODEL || "openai/gpt-oss-120b");
  }
  async chat(messages: ProviderMessage[], options?: ProviderOptions) {
    if (!this.baseUrlIsValid)
      throw new ProviderError(
        "Groq mode requires the official Groq OpenAI-compatible base URL.",
        "NOT_CONFIGURED",
      );
    const taggedOptions = {
      ...options,
      telemetry: options?.telemetry
        ? { ...options.telemetry, logicalRequestId: randomUUID() }
        : undefined,
    };
    const result = GroqProvider.pending.then(async () => {
      try {
        return await super.chat(messages, taggedOptions);
      } catch (error) {
        // Groq occasionally rejects generated JSON even in strict mode.
        // Retry that classified generation failure once, with identical input.
        // Backend-invalid findings and other 4xx errors are never retried here.
        if (
          error instanceof ProviderError &&
          error.code === "OUTPUT_JSON_INVALID"
        )
          return super.chat(messages, taggedOptions);
        throw error;
      }
    });
    GroqProvider.pending = result.catch(() => undefined);
    return result;
  }
  protected async beforeAttempt(
    body: Record<string, unknown>,
    options?: ProviderOptions,
  ) {
    const estimate =
      Math.ceil(
        JSON.stringify({
          messages: body.messages,
          tools: body.tools,
          response_format: body.response_format,
        }).length / 3,
      ) + Number(body.max_tokens);
    if (!(await quota.before(estimate, options?.signal)))
      throw new ProviderError(
        "Groq cooldown exceeds the bounded wait. Retry later.",
        "RATE_LIMIT_DEFERRED",
      );
  }
  protected retryDelay(attempt: number, response?: Response): number {
    if (response?.status === 429 && !response.headers.get("retry-after")) {
      const delay =
        resetDurationMs(response.headers.get("x-ratelimit-reset-tokens")) ??
        2000 * 2 ** attempt + Math.round(Math.random() * 500);
      if (delay > this.maxRetryWaitMs)
        throw new ProviderError(
          "Groq cooldown exceeds the bounded wait. Retry later.",
          "RATE_LIMIT_DEFERRED",
        );
      return delay;
    }
    return super.retryDelay(attempt, response);
  }
  protected async observeResponse(
    response: Response,
    body: Record<string, unknown>,
    options: ProviderOptions | undefined,
    attempt: number,
    durationMs: number,
    waitMs: number,
  ) {
    quota.observe(response.headers, response.status);
    const data = await response
      .clone()
      .json()
      .catch(() => null);
    const message =
      typeof data?.error?.message === "string" ? data.error.message : "";
    const numeric = (name: string) => {
      const value = response.headers.get(name);
      return value !== null && Number.isFinite(Number(value))
        ? Number(value)
        : null;
    };
    recordProviderMetric({
      timestampMs: Date.now(),
      investigationId: options?.telemetry?.investigationId ?? null,
      agent: options?.telemetry?.agentRole ?? "UNSPECIFIED",
      logicalRequestId: options?.telemetry?.logicalRequestId ?? null,
      attempt,
      status: response.status,
      durationMs,
      quotaWaitMs: waitMs,
      promptTokens:
        typeof data?.usage?.prompt_tokens === "number"
          ? data.usage.prompt_tokens
          : null,
      completionTokens:
        typeof data?.usage?.completion_tokens === "number"
          ? data.usage.completion_tokens
          : null,
      cachedPromptTokens:
        typeof data?.usage?.prompt_tokens_details?.cached_tokens === "number"
          ? data.usage.prompt_tokens_details.cached_tokens
          : null,
      tokenLimit: numeric("x-ratelimit-limit-tokens"),
      remainingTokens: numeric("x-ratelimit-remaining-tokens"),
      remainingDailyRequests: numeric("x-ratelimit-remaining-requests"),
      retryAfterMs: retryAfterMs(response.headers.get("retry-after")),
      tokenResetMs: resetDurationMs(
        response.headers.get("x-ratelimit-reset-tokens"),
      ),
      rateLimitKind:
        response.status !== 429
          ? null
          : /tokens per day|\bTPD\b/i.test(message)
            ? "TPD"
            : /tokens per minute|\bTPM\b/i.test(message)
              ? "TPM"
              : /requests per day|\bRPD\b/i.test(message)
                ? "RPD"
                : /requests per minute|\bRPM\b/i.test(message)
                  ? "RPM"
                  : "UNKNOWN",
    });
  }
  private finalFormat(body: Record<string, unknown>, ids: Set<string>) {
    if (!ids.size)
      throw new ProviderError(
        "No retrieved evidence IDs available for a structured finding.",
        "INVALID_RESPONSE",
      );
    const schema = structuredClone(advocateOutputSchema);
    const point = {
      ...evidencePoint,
      properties: {
        ...evidencePoint.properties,
        citedEvidenceIds: {
          type: "array",
          minItems: 1,
          items: { type: "string", enum: [...ids] },
        },
      },
    };
    schema.properties.final_answer.properties.supportingPoints.items = point;
    schema.properties.final_answer.properties.weakeningPoints.items = point;
    delete body.tools;
    delete body.tool_choice;
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "advocate_finding", strict: true, schema },
    };
    return body;
  }
  protected buildRequestBody(
    messages: ProviderMessage[],
    options?: ProviderOptions,
  ): Record<string, unknown> {
    const body = super.buildRequestBody(messages, options);
    body.max_tokens = options?.maxTokens ?? 2000;
    const advocate = messages.some(
      (m) =>
        m.role === "system" &&
        /You are the (RIDER|DRIVER) ADVOCATE/.test(m.content),
    );
    if (!advocate) {
      body.messages = messages.map((m) => ({
        role: m.role,
        content:
          m.role === "user" ? compactNeutralContext(m.content) : m.content,
      }));
      return body;
    }
    if (options?.prefetchedEvidence) {
      const prefetched = options.prefetchedEvidence;
      body.messages = [
        ...messages
          .filter((m) => !m.applicationPrefetch)
          .map((m) => ({
            role: m.role,
            content:
              m.role === "system"
                ? m.content +
                  "\nThe application executed the recorded evidence-tool read plan before inference. Its actual tool results below satisfy the retrieval step. Review all results and return only the final_answer JSON object. No additional tools are available."
                : m.content,
          })),
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "application_prefetch",
              type: "function",
              function: {
                name: BATCH_TOOL,
                arguments: JSON.stringify({ requests: prefetched.requests }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "application_prefetch",
          content: JSON.stringify(
            prefetched.results.map((result) => ({
              toolCallId: result.toolCallId,
              result: result.result,
            })),
          ),
        },
      ];
      return this.finalFormat(body, new Set(options.prefetchedEvidence.ids));
    }
    // GPT-OSS uses native tool calls. A transport-only batch envelope avoids
    // relying on native parallel calls. The unchanged backend validates and
    // executes each of the four allowlisted evidence requests separately.
    const wire: WireMessage[] = [];
    let batchId = "";
    let results: Array<{ toolCallId?: string; result: unknown }> = [];
    const flush = () => {
      if (results.length)
        wire.push({
          role: "tool",
          tool_call_id: batchId,
          content: JSON.stringify(results),
        });
      results = [];
    };
    for (const m of messages) {
      if (m.role === "tool") {
        results.push({
          toolCallId: m.toolCallId,
          result: JSON.parse(m.content),
        });
        continue;
      }
      flush();
      if (m.role === "assistant" && m.toolCalls?.length) {
        batchId = `batch_${m.toolCalls[0].id}`;
        wire.push({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: batchId,
              type: "function",
              function: {
                name: BATCH_TOOL,
                arguments: JSON.stringify({
                  requests: m.toolCalls.map((tc) => ({
                    name: tc.name,
                    arguments: tc.arguments,
                  })),
                }),
              },
            },
          ],
        });
      } else
        wire.push({
          role: m.role,
          content:
            m.role === "system"
              ? m.content +
                "\nTransport format: Use the native retrieve_evidence_batch function instead of the text tool_calls envelope. Put independent evidence requests together in its requests array. First batch: list_evidence, get_statements, get_trip_info. Second batch: get_evidence_detail for each listed group, within the existing eight-call total budget. After evidence retrieval, return the final_answer JSON envelope in message content. The application still validates the finding and every citation. Do not include markdown or reasoning."
              : m.content,
        });
    }
    flush();
    body.messages = wire;
    body.tools = [
      {
        type: "function",
        function: {
          name: BATCH_TOOL,
          description:
            "Retrieve multiple independent case evidence items. This only batches the existing read-only evidence tools; it cannot decide or approve outcomes.",
          parameters: {
            type: "object",
            properties: {
              requests: {
                type: "array",
                minItems: 1,
                maxItems: 8,
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", enum: EVIDENCE_TOOL_NAMES },
                    arguments: {
                      type: "object",
                      properties: { refGroup: { type: "string" } },
                      additionalProperties: false,
                    },
                  },
                  required: ["name", "arguments"],
                  additionalProperties: false,
                },
              },
            },
            required: ["requests"],
            additionalProperties: false,
          },
        },
      },
    ];
    body.tool_choice = "auto";
    delete body.response_format;
    // Groq's strict JSON output mode is used only after native evidence calls
    // have finished; it cannot be combined with active native tools.
    if (
      messages.some(
        (m) =>
          m.role === "assistant" &&
          m.toolCalls?.some((tc) => tc.name === "get_evidence_detail"),
      )
    ) {
      delete body.tools;
      delete body.tool_choice;
      const ids = new Set<string>();
      for (const message of messages.filter((m) => m.role === "tool")) {
        const value = JSON.parse(message.content);
        for (const entry of Array.isArray(value) ? value : [value]) {
          if (typeof entry?.evidenceId === "string" && entry.evidenceId)
            ids.add(entry.evidenceId);
        }
      }
      this.finalFormat(body, ids);
      const system = wire.find((m) => m.role === "system");
      if (system)
        system.content =
          String(system.content) +
          "\nFinal response transport: Evidence retrieval is complete. Return the final_answer JSON object in message content, following the supplied JSON schema. No native functions are available in this final response.";
    }
    return body;
  }
  protected completionContent(message: {
    content?: string | null;
    tool_calls?: unknown[];
  }): string | null | undefined {
    if (!message.tool_calls?.length) return super.completionContent(message);
    try {
      const requests = message.tool_calls.flatMap((raw) => {
        const call = raw as { function: { name: string; arguments: string } };
        if (call.function.name !== BATCH_TOOL)
          throw new Error("Unexpected transport tool");
        const args = JSON.parse(call.function.arguments);
        if (!Array.isArray(args.requests) || !args.requests.length)
          throw new Error("Malformed batch");
        return args.requests;
      });
      return JSON.stringify({ tool_calls: requests });
    } catch {
      throw new ProviderError(
        "Groq returned malformed evidence batch arguments.",
        "INVALID_RESPONSE",
      );
    }
  }
}
