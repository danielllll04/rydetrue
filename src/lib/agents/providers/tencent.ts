/**
 * Tencent Cloud LLM provider (OpenAI-compatible).
 *
 * Uses native `fetch` to call any OpenAI-compatible chat completions endpoint.
 * Default configuration targets Tencent Cloud's Hunyuan API, but the base URL
 * and model are configurable via environment variables.
 *
 * Environment variables:
 *  - RYDETRUE_LLM_API_KEY  (required for real calls) — Bearer token
 *  - RYDETRUE_LLM_BASE_URL  (optional) — defaults to Tencent Cloud endpoint
 *  - RYDETRUE_LLM_MODEL     (optional) — defaults to "hunyuan-pro"
 *
 * No secrets are logged or stored in audit events.
 */

import { LLMProvider, ProviderError, ProviderTimeoutError } from "../provider";
import { ProviderMessage, ProviderResponse, ProviderOptions } from "../types";

const DEFAULT_BASE_URL = "https://api.lkeap.cloud.tencent.com/v1";
const DEFAULT_MODEL = "hunyuan-pro";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 4_000;
const DEFAULT_TEMPERATURE = 0.2;

/**
 * Bounded retry configuration.
 *
 * Max 2 retries (3 total attempts). Only retryable errors (429 rate limit,
 * 5xx server errors, network errors) are retried. Timeouts, 4xx errors,
 * and response parsing failures are NOT retried.
 *
 * Backoff: exponential (500ms * 2^attempt) with 50-100% jitter.
 * Retry-After header is respected for 429 responses (capped at 30s).
 *
 * Worst-case retry overhead (all 429s, instant responses):
 *   attempt 0 → 429, wait ~500ms
 *   attempt 1 → 429, wait ~1000ms
 *   attempt 2 → 429, fail
 *   Total: ~1.5s overhead
 */
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 30_000;

/** Sleep for ms, abortable via signal. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const handle = setTimeout(() => resolve(), ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(handle);
      reject(new Error("Aborted"));
    });
  });
}

/** Compute retry delay with exponential backoff and jitter. */
function computeRetryDelay(attempt: number, retryAfterHeader?: string | null): number {
  // If server provided Retry-After, respect it (capped at MAX_RETRY_DELAY_MS).
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }
  }
  // Exponential backoff: 500ms * 2^attempt, with 50-100% jitter.
  const base = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jittered = base * (0.5 + Math.random() * 0.5);
  return Math.min(Math.round(jittered), MAX_RETRY_DELAY_MS);
}

export class TencentCloudProvider implements LLMProvider {
  readonly name = "tencent-cloud";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor() {
    this.apiKey = process.env.RYDETRUE_LLM_API_KEY ?? "";
    this.baseUrl =
      process.env.RYDETRUE_LLM_BASE_URL ?? DEFAULT_BASE_URL;
    this.defaultModel = process.env.RYDETRUE_LLM_MODEL ?? DEFAULT_MODEL;

    if (!this.apiKey) {
      // Don't throw here — the orchestrator checks provider readiness
      // and falls back to human review. We only throw on actual call.
    }
  }

  /** Check if the provider is configured (has an API key). */
  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async chat(
    messages: ProviderMessage[],
    options?: ProviderOptions
  ): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new ProviderError(
        "RYDETRUE_LLM_API_KEY is not set. Configure it in .env to use real LLM calls.",
        "NOT_CONFIGURED",
        false
      );
    }

    const model = options?.model ?? this.defaultModel;
    const temperature = options?.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Build OpenAI-compatible request body.
    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature,
      max_tokens: maxTokens,
      // Request JSON output for reliable parsing.
      response_format: { type: "json_object" },
    };

    // Bounded retry loop for transient failures (429, 5xx, network errors).
    // Timeouts (AbortError) and 4xx (non-429) are NOT retried.
    // Response parsing failures (200 OK but bad data) are NOT retried.
    let lastError: ProviderError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const isLastAttempt = attempt === MAX_RETRIES;

      // Create a fresh AbortController per attempt (previous one may have fired).
      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        timeoutMs
      );

      // Merge caller's signal with our timeout signal.
      if (options?.signal) {
        if (options.signal.aborted) {
          clearTimeout(timeoutHandle);
          throw new ProviderTimeoutError("Caller signal already aborted");
        }
        options.signal.addEventListener("abort", () => controller.abort());
      }

      // --- Attempt the HTTP request ---
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timeoutHandle);

        // Timeout — NOT retryable (server might still be processing).
        if (err instanceof Error && err.name === "AbortError") {
          throw new ProviderTimeoutError(
            `Request timed out after ${timeoutMs}ms`
          );
        }

        // Network error — retryable.
        lastError = new ProviderError(
          `Network error: ${(err as Error).message}`,
          "NETWORK_ERROR",
          true
        );

        if (isLastAttempt) {
          // All retries exhausted — mark as non-retryable for the caller.
          throw new ProviderError(lastError.message, lastError.code, false);
        }

        // Exponential backoff with jitter, then retry.
        const delayMs = computeRetryDelay(attempt);
        await sleep(delayMs, options?.signal).catch(() => {
          // Sleep interrupted (caller aborted) — throw timeout.
          throw new ProviderTimeoutError("Request aborted during retry backoff");
        });
        continue;
      }

      clearTimeout(timeoutHandle);

      // --- Check HTTP status ---
      if (!response.ok) {
        const errorText = await response.text().catch(() => "unknown");
        // 429 = rate limit (retryable), 5xx = server error (retryable)
        const retryable =
          response.status === 429 ||
          (response.status >= 500 && response.status < 600);

        const error = new ProviderError(
          `Provider returned ${response.status}: ${errorText.slice(0, 200)}`,
          `HTTP_${response.status}`,
          retryable
        );

        if (retryable && !isLastAttempt) {
          lastError = error;
          // Respect Retry-After header if present (primarily for 429).
          const retryAfter = response.headers.get("Retry-After");
          const delayMs = computeRetryDelay(attempt, retryAfter);
          await sleep(delayMs, options?.signal).catch(() => {
            throw new ProviderTimeoutError("Request aborted during retry backoff");
          });
          continue;
        }

        // Either non-retryable, or last attempt with retryable error.
        // If last attempt, mark as non-retryable (no more retries available).
        throw retryable
          ? new ProviderError(error.message, error.code, false)
          : error;
      }

      // --- Parse response body (NOT retried — server is responding) ---
      let data: {
        choices?: Array<{
          message?: { content?: string; tool_calls?: unknown[] };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      try {
        data = await response.json();
      } catch {
        throw new ProviderError(
          "Provider returned invalid JSON",
          "INVALID_RESPONSE",
          false
        );
      }

      const choice = data.choices?.[0];
      if (!choice || !choice.message?.content) {
        throw new ProviderError(
          "Provider returned no content",
          "EMPTY_RESPONSE",
          false
        );
      }

      const content = choice.message.content;
      const finishReason = choice.finish_reason ?? "stop";

      // Parse content as JSON (we requested json_object format).
      // The model may return tool calls or a final answer.
      let parsed: { tool_calls?: unknown; final_answer?: unknown } | null = null;
      try {
        parsed = JSON.parse(content);
      } catch {
        // If the model didn't return valid JSON despite requesting it,
        // treat the raw text as the content (the agent layer will handle parsing).
        parsed = null;
      }

      const toolCalls =
        parsed?.tool_calls && Array.isArray(parsed.tool_calls)
          ? parseToolCalls(parsed.tool_calls as unknown[])
          : undefined;

      return {
        content,
        toolCalls,
        finishReason: toolCalls ? "tool_calls" : "stop",
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        },
      };
    }

    // All retries exhausted — throw the last error with retryable=false
    // (no more retries available for the caller).
    throw lastError
      ? new ProviderError(lastError.message, lastError.code, false)
      : new ProviderError(
          "Retry loop exited without a result",
          "RETRY_EXHAUSTED",
          false
        );
  }
}

/**
 * Parse raw tool call objects from the model response into
 * ToolCallRequest objects with generated IDs.
 */
function parseToolCalls(raw: unknown[]): import("../types").ToolCallRequest[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (typeof item !== "object" || item === null) return null;
      const obj = item as Record<string, unknown>;
      const name = obj.name;
      const args = obj.arguments ?? obj.parameters ?? {};
      if (typeof name !== "string") return null;
      return {
        id: `tc_${Date.now()}_${i}`,
        name,
        arguments:
          typeof args === "object" && args !== null
            ? (args as Record<string, unknown>)
            : {},
      };
    })
    .filter((tc): tc is import("../types").ToolCallRequest => tc !== null);
}
