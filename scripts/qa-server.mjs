import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const directory = path.join(root, "qa");
mkdirSync(directory, { recursive: true });
const resume = process.argv[2];
const target = resume
  ? path.resolve(resume)
  : path.join(directory, `browser-run-${Date.now()}.db`);
if (!target.startsWith(directory + path.sep))
  throw new Error("QA database must stay in the isolated qa directory.");
if (resume) {
  if (!existsSync(target))
    throw new Error("The requested disposable QA database does not exist.");
} else copyFileSync(path.join(root, "prisma/dev.db"), target);
const env = {
  ...process.env,
  RYDETRUE_LLM_MODE: "mock",
  VITEST: "true",
  RYDETRUE_QA_DATABASE: target,
  RYDETRUE_PROVIDER_TRACE: path.join(
    directory,
    `mock-trace-${Date.now()}.jsonl`,
  ),
};
delete env.RYDETRUE_LLM_API_KEY;
console.log(
  "Browser QA: existing mock agents, disposable SQLite copy. Application database is unchanged.",
);
const child = spawn(
  process.execPath,
  [
    "--import",
    pathToFileURL(path.join(root, "scripts/qa-database.mjs")).href,
    path.join(root, "node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    process.env.PORT || "3101",
  ],
  { cwd: root, stdio: "inherit", env },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
