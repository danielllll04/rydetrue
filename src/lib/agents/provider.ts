/**
 * LLM Provider interface.
 *
 * Any provider that implements this interface can be used by the agent layer.
 * The interface is intentionally minimal: chat(messages, options) → response.
 *
 * Providers are responsible for:
 *  - Authentication (via env vars or constructor config)
 *  - HTTP transport (fetch, SDK, etc.)
 *  - Timeouts and retries (bounded)
 *  - Error handling (network errors, rate limits, invalid responses)
 *
 * Providers are NOT responsible for:
 *  - Tool execution (that's the orchestrator's job)
 *  - Output validation (that's the agent's job, via Zod)
 *  - Policy evaluation (that's the deterministic engine's job)
 */

import { ProviderMessage, ProviderResponse, ProviderOptions } from "./types";
import { TencentCloudProvider } from "./providers/tencent";
import { MockProvider } from "./providers/mock";

export interface LLMProvider {
  /** Provider name for logging/audit (never exposes secrets). */
  readonly name: string;

  /**
   * Send a chat completion request.
   *
   * @param messages - Conversation messages (system, user, assistant, tool)
   * @param options - Optional overrides (model, temperature, timeout, etc.)
   * @returns Provider response with content, optional tool calls, and finish reason
   *
   * @throws ProviderError on network failure, timeout, or invalid response
   */
  chat(
    messages: ProviderMessage[],
    options?: ProviderOptions
  ): Promise<ProviderResponse>;
}

/**
 * Base error class for provider failures.
 * The orchestrator catches these and falls back to human review.
 */
export class ProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable = false) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Timeout-specific error for explicit handling. */
export class ProviderTimeoutError extends ProviderError {
  constructor(message: string) {
    super(message, "TIMEOUT", false);
    this.name = "ProviderTimeoutError";
  }
}

/**
 * Factory: get the configured provider.
 *
 * Selection logic:
 *  1. If RYDETRUE_LLM_API_KEY is set → TencentCloudProvider (real LLM calls)
 *  2. If in test mode (VITEST or NODE_ENV=test) → MockProvider (deterministic)
 *  3. Otherwise → TencentCloudProvider (will throw NOT_CONFIGURED when called,
 *     causing the orchestrator to escalate to human review)
 *
 * Uses static ES module imports. The circular dependency between this module
 * and the provider implementations is safe in ESM because all imported values
 * (LLMProvider interface, ProviderError classes, provider constructors) are
 * only referenced inside function/method bodies at call time — never during
 * module evaluation.
 */
export function getProvider(): LLMProvider {
  const apiKey = process.env.RYDETRUE_LLM_API_KEY ?? "";

  if (apiKey) {
    return new TencentCloudProvider();
  }

  // In test mode without API key, use mock provider.
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    return new MockProvider();
  }

  // Production without API key — will throw NOT_CONFIGURED when called,
  // causing the orchestrator to escalate to human review.
  return new TencentCloudProvider();
}
