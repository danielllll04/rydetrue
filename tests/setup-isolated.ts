import { mkdirSync } from "node:fs";
import path from "node:path";
import { initializeDemo } from "../src/lib/fixtures/initialize-demo";
import { PrismaClient } from "@prisma/client";
// Existing backend tests intentionally mutate RT-001. Redirect their singleton
// before importing db.ts so application and original databases are never touched.
delete process.env.RYDETRUE_LLM_API_KEY;
process.env.VITEST = "true";
process.env.RYDETRUE_LLM_MODE = "mock";
if (!global.__rydetrue_prisma) {
  const directory = path.resolve("qa");
  mkdirSync(directory, { recursive: true });
  const target = path.join(
    directory,
    `test-run-${process.pid}-${Date.now()}.db`,
  );

  global.__rydetrue_prisma = new PrismaClient({
    datasources: { db: { url: `file:${target.replaceAll("\\", "/")}` } },
  });
  await initializeDemo(global.__rydetrue_prisma);
}
