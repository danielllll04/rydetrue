import { afterEach, describe, expect, it, vi } from "vitest";
import { getProvider } from "../src/lib/agents/provider";
import { MockProvider } from "../src/lib/agents/providers/mock";
import { GroqProvider } from "../src/lib/agents/providers/groq";
const initial = {
  mode: process.env.RYDETRUE_LLM_MODE,
  key: process.env.RYDETRUE_LLM_API_KEY,
  base: process.env.RYDETRUE_LLM_BASE_URL,
  model: process.env.RYDETRUE_LLM_MODEL,
};
const messages = [
  { role: "user" as const, content: "Return structured JSON." },
];
afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, value] of Object.entries({
    RYDETRUE_LLM_MODE: initial.mode,
    RYDETRUE_LLM_API_KEY: initial.key,
    RYDETRUE_LLM_BASE_URL: initial.base,
    RYDETRUE_LLM_MODEL: initial.model,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
describe("Explicit provider isolation (no real network)", () => {
  it("defaults to mock even when dotenv or inheritance provides a key", () => {
    delete process.env.RYDETRUE_LLM_MODE;
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    expect(getProvider()).toBeInstanceOf(MockProvider);
  });
  it("mock mode cannot call Groq even when a key is loaded afterwards", async () => {
    process.env.RYDETRUE_LLM_MODE = "mock";
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network prohibited in mock test"));
    const provider = getProvider();
    await provider.chat([
      { role: "system", content: "You are the RIDER ADVOCATE in RydeTRUE." },
      ...messages,
    ]);
    expect(provider.name).toBe("mock");
    expect(spy).not.toHaveBeenCalled();
  });
  it("explicit groq selects only the real adapter, including in a test process", () => {
    process.env.RYDETRUE_LLM_MODE = "groq";
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    process.env.RYDETRUE_LLM_BASE_URL = "https://api.groq.com/openai/v1";
    expect(getProvider()).toBeInstanceOf(GroqProvider);
    expect(getProvider().name).toBe("groq");
  });
  it("real mode without a key fails closed rather than returning mock", async () => {
    process.env.RYDETRUE_LLM_MODE = "groq";
    delete process.env.RYDETRUE_LLM_API_KEY;
    delete process.env.RYDETRUE_LLM_BASE_URL;
    const spy = vi.spyOn(globalThis, "fetch");
    const provider = getProvider();
    expect(provider.name).toBe("groq");
    await expect(provider.chat(messages)).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
    expect(spy).not.toHaveBeenCalled();
  });
  it("rejects an unexpected real host before any credential can be transmitted", async () => {
    process.env.RYDETRUE_LLM_MODE = "groq";
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    process.env.RYDETRUE_LLM_BASE_URL = "https://example.invalid/v1";
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(getProvider().chat(messages)).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
    expect(spy).not.toHaveBeenCalled();
  });
  it("invalid mode is a configuration failure rather than implicit real or mock", async () => {
    process.env.RYDETRUE_LLM_MODE = "unexpected";
    const provider = getProvider();
    expect(provider.name).toBe("unconfigured");
    await expect(provider.chat(messages)).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });
  it("never exposes upstream error bodies, even if a service echoes credentials", async () => {
    process.env.RYDETRUE_LLM_MODE = "groq";
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    process.env.RYDETRUE_LLM_BASE_URL = "https://api.groq.com/openai/v1";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("echo: synthetic-test-credential", { status: 401 }),
    );
    await expect(getProvider().chat(messages)).rejects.toMatchObject({
      code: "HTTP_401",
      message: "Provider returned HTTP 401.",
    });
  });
  it("bridges native Groq calls and tool results to the unchanged application protocol", async () => {
    process.env.RYDETRUE_LLM_MODE = "groq";
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    delete process.env.RYDETRUE_LLM_BASE_URL;
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "upstream-id",
                    type: "function",
                    function: {
                      name: "retrieve_evidence_batch",
                      arguments:
                        '{"requests":[{"name":"list_evidence","arguments":{}}]}',
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
      ),
    );
    const response = await getProvider().chat([
      { role: "system", content: "You are the RIDER ADVOCATE. Return JSON." },
      {
        role: "assistant",
        content: '{"tool_calls":[]}',
        toolCalls: [{ id: "tc_0_0", name: "list_evidence", arguments: {} }],
      },
      {
        role: "tool",
        content: '{"evidenceId":"synthetic-id"}',
        toolCallId: "tc_0_0",
      },
    ]);
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body.tool_choice).toBe("auto");
    expect(body.include_reasoning).toBeUndefined();
    expect(body.messages[2]).toEqual({
      role: "tool",
      content:
        '[{"toolCallId":"tc_0_0","result":{"evidenceId":"synthetic-id"}}]',
      tool_call_id: "batch_tc_0_0",
    });
    expect(body.messages[1].tool_calls[0].id).toBe("batch_tc_0_0");
    expect(
      body.tools[0].function.parameters.properties.requests.items.properties
        .name.enum,
    ).toEqual([
      "list_evidence",
      "get_evidence_detail",
      "get_statements",
      "get_trip_info",
    ]);
    expect(JSON.parse(response.content)).toEqual({
      tool_calls: [{ name: "list_evidence", arguments: {} }],
    });
    expect(JSON.stringify(body)).not.toContain("synthetic-test-credential");
  });
  it("rejects malformed native batches before the backend can execute anything", async () => {
    process.env.RYDETRUE_LLM_MODE = "groq";
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    delete process.env.RYDETRUE_LLM_BASE_URL;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: "retrieve_evidence_batch",
                      arguments: '{"requests":[]}',
                    },
                  },
                ],
              },
            },
          ],
        }),
      ),
    );
    await expect(getProvider().chat(messages)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("requires structured final output with only retrieved evidence IDs and no active tools", async () => {
    process.env.RYDETRUE_LLM_MODE = "groq";
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    delete process.env.RYDETRUE_LLM_BASE_URL;
    const content =
      '{"final_answer":{"summary":"synthetic, deliberately incomplete finding"}}';
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content } }] })),
      );
    const response = await getProvider().chat([
      { role: "system", content: "You are the RIDER ADVOCATE." },
      {
        role: "assistant",
        content: "{}",
        toolCalls: [
          {
            id: "tc_1",
            name: "get_evidence_detail",
            arguments: { refGroup: "rider-gps" },
          },
        ],
      },
      {
        role: "tool",
        toolCallId: "tc_1",
        content: '{"evidenceId":"case-evidence-1","refGroup":"rider-gps"}',
      },
    ]);
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(response.content).toBe(content);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(
      body.response_format.json_schema.schema.properties.final_answer.properties
        .supportingPoints.items.properties.citedEvidenceIds.items.enum,
    ).toEqual(["case-evidence-1"]);
  });
  it("serializes requests within an investigation without sharing agent messages", async () => {
    process.env.RYDETRUE_LLM_MODE = "groq";
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    delete process.env.RYDETRUE_LLM_BASE_URL;
    let active = 0;
    let maximum = 0;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"final_answer":{}}' } }],
        }),
      );
    });
    const provider = getProvider();
    await Promise.all([
      provider.chat([{ role: "user", content: "independent-rider" }]),
      provider.chat([{ role: "user", content: "independent-driver" }]),
    ]);
    expect(maximum).toBe(1);
    const bodies = spy.mock.calls.map((call) =>
      JSON.parse(String(call[1]?.body)),
    );
    expect(bodies[0].messages[0].content).toBe("independent-rider");
    expect(bodies[1].messages[0].content).toBe("independent-driver");
  });
  it("gives the neutral agent no tools and preserves JSON output mode", async () => {
    process.env.RYDETRUE_LLM_MODE = "groq";
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    delete process.env.RYDETRUE_LLM_BASE_URL;
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"final_answer":{}}' } }],
        }),
      ),
    );
    await getProvider().chat([
      { role: "system", content: "You are the NEUTRAL RESOLUTION agent." },
      ...messages,
    ]);
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body.tools).toBeUndefined();
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.reasoning_effort).toBe("low");
  });
  it("retries a classified upstream JSON-generation failure once, without exposing its body", async () => {
    process.env.RYDETRUE_LLM_MODE = "groq";
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    delete process.env.RYDETRUE_LLM_BASE_URL;
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "json_validate_failed",
              message: "synthetic-test-credential",
            },
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"final_answer":{}}' } }],
          }),
        ),
      );
    expect((await getProvider().chat(messages)).content).toBe(
      '{"final_answer":{}}',
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("stops after a second upstream JSON-generation failure", async () => {
    process.env.RYDETRUE_LLM_MODE = "groq";
    process.env.RYDETRUE_LLM_API_KEY = "synthetic-test-credential";
    delete process.env.RYDETRUE_LLM_BASE_URL;
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "json_validate_failed",
                message: "synthetic-test-credential",
              },
            }),
            { status: 400 },
          ),
      );
    await expect(getProvider().chat(messages)).rejects.toMatchObject({
      code: "OUTPUT_JSON_INVALID",
      message: "Provider returned HTTP 400.",
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
