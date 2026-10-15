import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync } from "node:fs";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.resolve(process.env.RYDETRUE_QA_DATABASE || "");
if (!target.startsWith(path.join(root, "qa") + path.sep))
  throw new Error("QA database must stay within the isolated qa directory.");
globalThis.__rydetrue_prisma = new PrismaClient({
  datasources: { db: { url: `file:${target.replaceAll("\\", "/")}` } },
});
// QA-only network provenance. Never log headers, request bodies, output text,
// upstream errors, or keys. Real calls remain normal native fetch requests.
if (process.env.RYDETRUE_PROVIDER_TRACE) {
  const tracePath = path.resolve(process.env.RYDETRUE_PROVIDER_TRACE);
  if (!tracePath.startsWith(path.join(root, "qa") + path.sep))
    throw new Error("QA trace must stay under qa.");
  appendFileSync(tracePath, "");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    const raw = args[0];
    const url = new URL(
      typeof raw === "string" || raw instanceof URL ? raw : raw.url,
    );
    if (
      url.origin !== "https://api.groq.com" ||
      url.pathname !== "/openai/v1/chat/completions"
    )
      return originalFetch(...args);
    const started = Date.now();
    try {
      const response = await originalFetch(...args);
      const record = {
        host: "api.groq.com",
        status: response.status,
        durationMs: Date.now() - started,
      };
      const tokenLimit = Number(
        response.headers.get("x-ratelimit-limit-tokens"),
      );
      if (Number.isFinite(tokenLimit) && tokenLimit > 0)
        record.tokenLimitPerMinute = tokenLimit;
      if (response.ok) {
        const data = await response
          .clone()
          .json()
          .catch(() => null);
        record.hasContent =
          typeof data?.choices?.[0]?.message?.content === "string" &&
          data.choices[0].message.content.length > 0;
        record.nativeToolCalls = Array.isArray(
          data?.choices?.[0]?.message?.tool_calls,
        )
          ? data.choices[0].message.tool_calls.length
          : 0;
        record.contentType = typeof data?.choices?.[0]?.message?.content;
        record.hasSeparateReasoning =
          typeof data?.choices?.[0]?.message?.reasoning === "string";
        record.validCompletion =
          record.hasContent || record.nativeToolCalls > 0;
        record.requestedModelReturned = data?.model === "openai/gpt-oss-120b";
        record.completionId =
          typeof data?.id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(data.id)
            ? data.id
            : null;
        record.tokenBudgetExhausted =
          data?.choices?.[0]?.finish_reason === "length";
        record.promptTokens =
          typeof data?.usage?.prompt_tokens === "number"
            ? data.usage.prompt_tokens
            : null;
        record.completionTokens =
          typeof data?.usage?.completion_tokens === "number"
            ? data.usage.completion_tokens
            : null;
      } else {
        const data = await response
          .clone()
          .json()
          .catch(() => null);
        const message =
          typeof data?.error?.message === "string" ? data.error.message : "";
        record.jsonValidationFailure =
          data?.error?.code === "json_validate_failed";
        record.toolUseFailure = data?.error?.code === "tool_use_failed";
        record.finalAnswerMentioned = /final_answer/i.test(message);
        record.toolMentioned = /tool/i.test(message);
        record.unsupportedParameter = /unsupported|not supported/i.test(
          message,
        );
        record.errorCategory = /tool_call_id|role.*tool/i.test(message)
          ? "tool_message_protocol"
          : /rate limit|tokens per|too many requests/i.test(message)
            ? "rate_limit"
            : /api key|authentication/i.test(message)
              ? "authentication"
              : /model/i.test(message)
                ? "model_configuration"
                : "upstream_request_error";
      }
      appendFileSync(tracePath, JSON.stringify(record) + "\n");
      return response;
    } catch (error) {
      appendFileSync(
        tracePath,
        JSON.stringify({
          host: "api.groq.com",
          status: 0,
          durationMs: Date.now() - started,
        }) + "\n",
      );
      throw error;
    }
  };
}
