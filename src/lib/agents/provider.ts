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
import { GroqProvider } from "./providers/groq";
import { MockProvider } from "./providers/mock";
import { selectedProviderMode } from "./provider-mode";

export interface LLMProvider {
  /** Provider name for logging/audit (never exposes secrets). */
  readonly name: string;
  readonly prefetchEvidence?: boolean;
  /** Non-secret model/workflow identity used only for validated retry reuse. */
  readonly configurationIdentity?: string;

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
    options?: ProviderOptions,
  ): Promise<ProviderResponse>;
}

/**
 * Base error class for provider failures.
 * The orchestrator catches these and falls back to human review.
 */
export { ProviderError, ProviderTimeoutError } from "./provider-errors";
import { ProviderError } from "./provider-errors";

/**
 * Factory: get the configured provider.
 *
 * Selection logic:
 *  1. mock (default) → MockProvider, regardless of credentials or dotenv loading.
 *  2. groq (explicit) → GroqProvider; errors escalate, never substitute mock.
 *  3. Any other value → configuration failure; no network call or mock fallback.
 *
 * Provider interfaces are type-only imports; shared errors live in a separate
 * module so adapter inheritance cannot introduce a runtime import cycle.
 */
export function getProvider(): LLMProvider {
  const mode = selectedProviderMode();
  if (mode === "mock") return new MockProvider();
  if (mode === "groq") return new GroqProvider();
  return {
    name: "unconfigured",
    async chat() {
      throw new ProviderError(
        "RYDETRUE_LLM_MODE must be mock or groq.",
        "NOT_CONFIGURED",
      );
    },
  };
}
