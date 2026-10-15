import { spawn } from "node:child_process";
const command = process.argv[2];
if (!["dev", "start"].includes(command)) throw new Error("Use dev or start.");
// Explicit mock overrides credentials that Next may subsequently load from dotenv.
const env = { ...process.env, RYDETRUE_LLM_MODE: "mock", VITEST: "true" };
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
