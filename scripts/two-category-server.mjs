import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mode = process.argv[2],
  command = process.argv[3] || "start";
if (!["mock", "groq"].includes(mode) || !["dev", "start"].includes(command))
  throw new Error("Use mock|groq followed by dev|start.");
if (mode === "groq") {
  createRequire(import.meta.url)("@next/env").loadEnvConfig(
    root,
    command === "dev",
    { info() {}, error() {} },
  );
  if (!process.env.RYDETRUE_LLM_API_KEY?.trim()) {
    console.error(
      "Groq key missing. Configure RYDETRUE_LLM_API_KEY locally in ignored .env.local; never paste or commit it.",
    );
    process.exit(1);
  }
  if (
    process.env.RYDETRUE_LLM_BASE_URL?.replace(/\/$/, "") !==
      "https://api.groq.com/openai/v1" ||
    process.env.RYDETRUE_LLM_MODEL !== "openai/gpt-oss-120b"
  ) {
    console.error(
      "Configure the official Groq base URL and verified openai/gpt-oss-120b model in .env.local.",
    );
    process.exit(1);
  }
}
const directory = path.join(root, "qa");
mkdirSync(directory, { recursive: true });
const stamp = Date.now(),
  target = path.join(directory, `two-category-${mode}-${stamp}.db`);
copyFileSync(path.join(root, "prisma/dev.db"), target);
const env = {
  ...process.env,
  RYDETRUE_LLM_MODE: mode,
  RYDETRUE_QA_DATABASE: target,
  RYDETRUE_PROVIDER_TRACE: path.join(
    directory,
    `two-category-${mode}-${stamp}-trace.jsonl`,
  ),
  RYDETRUE_LLM_METRICS: path.join(
    directory,
    `two-category-${mode}-${stamp}-metrics.jsonl`,
  ),
};
if (mode === "mock") {
  env.VITEST = "true";
  delete env.RYDETRUE_LLM_API_KEY;
} else delete env.VITEST;
writeFileSync(env.RYDETRUE_LLM_METRICS, "");
const fixture = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/add-fare-fixture.ts", target],
  { cwd: root, stdio: "inherit", env },
);
if (fixture.status !== 0) process.exit(1);
const port = process.env.PORT || (mode === "mock" ? "3130" : "3131");
writeFileSync(
  path.join(directory, `two-category-last-${mode}.json`),
  JSON.stringify(
    {
      mode,
      database: target,
      trace: env.RYDETRUE_PROVIDER_TRACE,
      metrics: env.RYDETRUE_LLM_METRICS,
      origin: `http://127.0.0.1:${port}`,
    },
    null,
    2,
  ),
);
console.log(
  `Explicit ${mode} mode. RT-001 preserved; RT-002 added. Disposable database: qa/${path.basename(target)}. No automatic inference or approval.`,
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
    port,
  ],
  { cwd: root, stdio: "inherit", env },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
