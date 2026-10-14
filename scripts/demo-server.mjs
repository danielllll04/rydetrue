import { spawn } from "node:child_process";
const command = process.argv[2];
if (!["dev", "start"].includes(command)) throw new Error("Use dev or start.");
// The existing backend factory selects its MockProvider for VITEST=true.
// This process-local flag makes demo execution explicit; no provider code changes.
const env = { ...process.env, VITEST: "true" };
delete env.RYDETRUE_LLM_API_KEY;
console.log(
  "RydeTRUE DEMO: existing mock agents + persisted local API. No real LLM calls.",
);
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    command,
    "--hostname",
    "127.0.0.1",
    "--port",
    process.env.PORT || "3100",
  ],
  { stdio: "inherit", env },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
