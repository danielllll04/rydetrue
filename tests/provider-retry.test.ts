/**
 * TencentCloudProvider retry behavior tests.
 *
 * These tests mock `globalThis.fetch` to simulate transient HTTP failures
 * (429, 5xx, network errors) and verify that the provider retries with
 * bounded exponential backoff.
 *
 * The TencentCloudProvider is tested directly — these are NOT real API calls.
 * The MockProvider (used in agent tests) does not have retry logic; retry is
 * a TencentCloudProvider feature.
 *
 * Key properties verified:
 *  - 429 rate limit is retried and succeeds on subsequent attempt
 *  - 5xx server error is retried and succeeds on subsequent attempt
 *  - Network error is retried and succeeds on subsequent attempt
 *  - All retries exhausted → ProviderError with retryable=false
 *  - 4xx (non-429) is NOT retried — immediate throw
 *  - 200 OK but empty response is NOT retried — immediate throw
 *  - Timeout (AbortError) is NOT retried — immediate throw
 *  - Retry-After header is respected
 *  - API key is never included in error messages
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TencentCloudProvider } from "../src/lib/agents/providers/tencent";
import { ProviderError, ProviderTimeoutError } from "../src/lib/agents/provider";
import type { ProviderMessage } from "../src/lib/agents/types";

// Save original fetch and env so we can restore after tests.
const originalFetch = globalThis.fetch;
const originalApiKey = process.env.RYDETRUE_LLM_API_KEY;

/** Helper: build a minimal chat message array. */
function basicMessages(): ProviderMessage[] {
  return [
    { role: "system", content: 'Respond with {"status":"ok"}' },
    { role: "user", content: 'Respond with {"status":"ok"}' },
  ];
}

/** Helper: build a valid 200 OK response with JSON content. */
function okResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/** Helper: build an error response. */
function errorResponse(status: number, text = "error", headers?: Record<string, string>): Response {
  return new Response(text, { status, headers });
}

describe("TencentCloudProvider — bounded retry behavior", () => {
  let provider: TencentCloudProvider;

  beforeEach(() => {
    process.env.RYDETRUE_LLM_API_KEY = "test-key-12345";
    process.env.RYDETRUE_LLM_BASE_URL = "https://test.example.com/v1";
    process.env.RYDETRUE_LLM_MODEL = "test-model";
    provider = new TencentCloudProvider();
  });

  afterEach(() => {
    // Restore original state.
    globalThis.fetch = originalFetch;
    if (originalApiKey !== undefined) {
      process.env.RYDETRUE_LLM_API_KEY = originalApiKey;
    } else {
      delete process.env.RYDETRUE_LLM_API_KEY;
    }
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Retryable: 429 rate limit
  // -----------------------------------------------------------------------

  it("retries on 429 and succeeds on second attempt", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errorResponse(429, "rate limited"))
      .mockResolvedValueOnce(okResponse('{"status":"ok"}'));

    globalThis.fetch = fetchMock as never;

    const response = await provider.chat(basicMessages(), {
      timeoutMs: 5_000,
      maxTokens: 100,
    });

    expect(response.content).toBe('{"status":"ok"}');
    expect(response.finishReason).toBe("stop");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Retryable: 5xx server error
  // -----------------------------------------------------------------------

  it("retries on 503 and succeeds on second attempt", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errorResponse(503, "service unavailable"))
      .mockResolvedValueOnce(okResponse('{"status":"ok"}'));

    globalThis.fetch = fetchMock as never;

    const response = await provider.chat(basicMessages(), {
      timeoutMs: 5_000,
      maxTokens: 100,
    });

    expect(response.content).toBe('{"status":"ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 500 and succeeds on third attempt", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errorResponse(500, "internal error"))
      .mockResolvedValueOnce(errorResponse(502, "bad gateway"))
      .mockResolvedValueOnce(okResponse('{"status":"ok"}'));

    globalThis.fetch = fetchMock as never;

    const response = await provider.chat(basicMessages(), {
      timeoutMs: 5_000,
      maxTokens: 100,
    });

    expect(response.content).toBe('{"status":"ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // -----------------------------------------------------------------------
  // Retryable: network error
  // -----------------------------------------------------------------------

  it("retries on network error and succeeds on second attempt", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(okResponse('{"status":"ok"}'));

    globalThis.fetch = fetchMock as never;

    const response = await provider.chat(basicMessages(), {
      timeoutMs: 5_000,
      maxTokens: 100,
    });

    expect(response.content).toBe('{"status":"ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // All retries exhausted
  // -----------------------------------------------------------------------

  it("throws ProviderError after all retries exhausted on 429", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(errorResponse(429, "rate limited"));

    globalThis.fetch = fetchMock as never;

    // MAX_RETRIES = 2, so 3 total attempts.
    await expect(
      provider.chat(basicMessages(), { timeoutMs: 5_000, maxTokens: 100 })
    ).rejects.toThrow(ProviderError);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws ProviderError after all retries exhausted on network error", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValue(new TypeError("connection refused"));

    globalThis.fetch = fetchMock as never;

    await expect(
      provider.chat(basicMessages(), { timeoutMs: 5_000, maxTokens: 100 })
    ).rejects.toThrow(ProviderError);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("final error after retries has retryable=false", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(errorResponse(429, "rate limited"));

    globalThis.fetch = fetchMock as never;

    try {
      await provider.chat(basicMessages(), { timeoutMs: 5_000, maxTokens: 100 });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      const pe = err as ProviderError;
      expect(pe.retryable).toBe(false);
      expect(pe.code).toBe("HTTP_429");
    }
  });

  // -----------------------------------------------------------------------
  // NOT retried: 4xx (non-429)
  // -----------------------------------------------------------------------

  it("does NOT retry on 400 bad request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(errorResponse(400, "bad request"));

    globalThis.fetch = fetchMock as never;

    await expect(
      provider.chat(basicMessages(), { timeoutMs: 5_000, maxTokens: 100 })
    ).rejects.toThrow(ProviderError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 401 unauthorized", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(errorResponse(401, "unauthorized"));

    globalThis.fetch = fetchMock as never;

    await expect(
      provider.chat(basicMessages(), { timeoutMs: 5_000, maxTokens: 100 })
    ).rejects.toThrow(ProviderError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // NOT retried: 200 OK but bad response
  // -----------------------------------------------------------------------

  it("does NOT retry on 200 OK with empty content", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "" } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    globalThis.fetch = fetchMock as never;

    await expect(
      provider.chat(basicMessages(), { timeoutMs: 5_000, maxTokens: 100 })
    ).rejects.toThrow(ProviderError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 200 OK with invalid JSON body", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(
        new Response("not valid json {{{", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    globalThis.fetch = fetchMock as never;

    await expect(
      provider.chat(basicMessages(), { timeoutMs: 5_000, maxTokens: 100 })
    ).rejects.toThrow(ProviderError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // NOT retried: timeout
  // -----------------------------------------------------------------------

  it("does NOT retry on timeout (AbortError)", async () => {
    // Simulate fetch that never resolves (will be aborted by timeout).
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        // Listen for the abort signal to simulate real fetch behavior.
        init.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    globalThis.fetch = fetchMock as never;

    // Use a very short timeout to make the test fast.
    await expect(
      provider.chat(basicMessages(), { timeoutMs: 100, maxTokens: 100 })
    ).rejects.toThrow(ProviderTimeoutError);

    // Only one attempt — timeouts are not retried.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Retry-After header
  // -----------------------------------------------------------------------

  it("respects Retry-After header for 429", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        errorResponse(429, "rate limited", { "Retry-After": "1" })
      )
      .mockResolvedValueOnce(okResponse('{"status":"ok"}'));

    globalThis.fetch = fetchMock as never;

    const start = Date.now();
    const response = await provider.chat(basicMessages(), {
      timeoutMs: 5_000,
      maxTokens: 100,
    });
    const elapsed = Date.now() - start;

    expect(response.content).toBe('{"status":"ok"}');
    // Retry-After: 1 means ~1000ms delay.
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });

  // -----------------------------------------------------------------------
  // Security: API key never in error messages
  // -----------------------------------------------------------------------

  it("does not expose API key in error messages", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(errorResponse(429, "rate limited"));

    globalThis.fetch = fetchMock as never;

    try {
      await provider.chat(basicMessages(), { timeoutMs: 5_000, maxTokens: 100 });
      expect.fail("Should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain("test-key-12345");
      expect(msg).not.toContain("Bearer");
    }
  });

  // -----------------------------------------------------------------------
  // NOT_CONFIGURED when no API key
  // -----------------------------------------------------------------------

  it("throws NOT_CONFIGURED when API key is not set", async () => {
    delete process.env.RYDETRUE_LLM_API_KEY;
    const unconfigured = new TencentCloudProvider();

    await expect(
      unconfigured.chat(basicMessages())
    ).rejects.toThrow(ProviderError);

    try {
      await unconfigured.chat(basicMessages());
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).code).toBe("NOT_CONFIGURED");
      expect((err as ProviderError).retryable).toBe(false);
    }
  });

  // -----------------------------------------------------------------------
  // Tool calls parsed from response
  // -----------------------------------------------------------------------

  it("parses tool_calls from successful response", async () => {
    const toolCallContent = JSON.stringify({
      tool_calls: [
        { name: "list_evidence", arguments: {} },
      ],
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse(toolCallContent));

    globalThis.fetch = fetchMock as never;

    const response = await provider.chat(basicMessages(), {
      timeoutMs: 5_000,
      maxTokens: 100,
    });

    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls!.length).toBe(1);
    expect(response.toolCalls![0].name).toBe("list_evidence");
    expect(response.finishReason).toBe("tool_calls");
  });
});
