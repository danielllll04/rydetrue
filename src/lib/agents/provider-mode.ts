/** Shared server-only mode selection. A credential is never an opt-in. */
export type ExplicitProviderMode = "mock" | "groq" | "invalid";
export function selectedProviderMode(): ExplicitProviderMode {
  const mode = process.env.RYDETRUE_LLM_MODE ?? "mock";
  return mode === "mock" || mode === "groq" ? mode : "invalid";
}
