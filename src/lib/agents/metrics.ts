import { appendFileSync } from "node:fs";
import path from "node:path";
/** Opt-in, metadata-only local QA output. No arbitrary headers or text. */
export function recordProviderMetric(record: Record<string, unknown>) {
  if (!process.env.RYDETRUE_LLM_METRICS) return;
  const file = path.resolve(process.env.RYDETRUE_LLM_METRICS);
  if (!file.startsWith(path.resolve("qa") + path.sep))
    throw new Error("LLM metrics must stay in ignored qa directory.");
  appendFileSync(file, JSON.stringify(record) + "\n");
}
