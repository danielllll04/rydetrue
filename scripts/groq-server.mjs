import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const command = process.argv[2];
if (!["dev", "start"].includes(command)) throw new Error("Use dev or start.");
loadEnvConfig(root, command === "dev", { info() {}, error() {} });
if (!process.env.RYDETRUE_LLM_API_KEY?.trim()) {
  console.error(
    "Groq key missing. Configure RYDETRUE_LLM_API_KEY locally in ignored .env.local.",
  );
  process.exit(1);
}
if (
  process.env.RYDETRUE_LLM_BASE_URL?.replace(/\/$/, "") !==
    "https://api.groq.com/openai/v1" ||
  !process.env.RYDETRUE_LLM_MODEL
) {
  console.error(
    "Configure the official Groq base URL and model locally before starting real mode.",
  );
  process.exit(1);
}
const directory = path.join(root, "qa");
mkdirSync(directory, { recursive: true });
const stamp = Date.now();
const target = path.join(directory, `groq-run-${stamp}.db`);
copyFileSync(path.join(root, "prisma/dev.db"), target);
const env = {
  ...process.env,
  RYDETRUE_LLM_MODE: "groq",
  RYDETRUE_QA_DATABASE: target,
  RYDETRUE_PROVIDER_TRACE: path.join(directory, `groq-trace-${stamp}.jsonl`),
  RYDETRUE_LLM_METRICS: path.join(directory, `groq-metrics-${stamp}.jsonl`),
};
delete env.VITEST;
writeFileSync(env.RYDETRUE_LLM_METRICS, "");
console.log(
  `Explicit Groq mode. Disposable database: qa/groq-run-${stamp}.db. No automatic investigation or approval.`,
);
const child = spawn(
  process.execPath,
  [
    "--import",
    pathToFileURL(path.join(root, "scripts/qa-database.mjs")).href,
    path.join(root, "node_modules/next/dist/bin/next"),
    command,
    "--hostname",
    "127.0.0.1",
    "--port",
    process.env.PORT || "3102",
  ],
  { cwd: root, stdio: "inherit", env },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
