import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
const port = process.env.PORT ?? "10000";
if (!/^\d+$/.test(port) || +port < 1 || +port > 65535)
  throw new Error("Invalid PORT");
const env = {
  ...process.env,
  NODE_ENV: "production",
  RYDETRUE_PUBLIC_DEMO: "true",
  RYDETRUE_LLM_MODE: "mock",
  NEXT_TELEMETRY_DISABLED: "1",
};
for (const name of Object.keys(env))
  if (/API_KEY|SECRET|TOKEN/.test(name) && name.startsWith("RYDETRUE_"))
    delete env[name];
const child = spawn(
  process.execPath,
  [
    "--import",
    pathToFileURL(path.resolve("scripts/public-runtime.mjs")).href,
    path.resolve("node_modules/next/dist/bin/next"),
    "start",
    "-H",
    "0.0.0.0",
    "-p",
    port,
  ],
  { env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
