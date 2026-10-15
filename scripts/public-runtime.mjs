// Loaded before Next, including its environment loading. Defense in depth:
// public inference is mock-only even if a local dotenv file selects Groq.
process.env.RYDETRUE_PUBLIC_DEMO = "true";
process.env.RYDETRUE_LLM_MODE = "mock";
delete process.env.RYDETRUE_LLM_API_KEY;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    console.error(
      "Public demo blocked an external fetch; no network request sent.",
    );
    throw new Error("public_demo_external_fetch_blocked");
  }
  return originalFetch(input, init);
};
