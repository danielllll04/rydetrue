import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
// Existing backend tests intentionally mutate RT-001. Redirect their singleton
// before importing db.ts so application and original databases are never touched.
delete process.env.RYDETRUE_LLM_API_KEY;
process.env.VITEST = "true";
if (!global.__rydetrue_prisma) {
  const source = path.resolve("prisma/dev.db");
  if (!existsSync(source))
    throw new Error(
      "An application database snapshot is required; tests will not seed or reset it.",
    );
  const directory = path.resolve("qa");
  mkdirSync(directory, { recursive: true });
  const target = path.join(
    directory,
    `test-run-${process.pid}-${Date.now()}.db`,
  );
  copyFileSync(source, target);
  global.__rydetrue_prisma = new PrismaClient({
    datasources: { db: { url: `file:${target.replaceAll("\\", "/")}` } },
  });
}
