import path from "node:path";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { addFareCase } from "../src/lib/fixtures/add-fare-case";
const target = path.resolve(process.argv[2] || "");
if (
  !target.startsWith(path.resolve("qa") + path.sep) ||
  !target.endsWith(".db") ||
  !existsSync(target)
)
  throw new Error(
    "Provide an existing disposable database under qa; original databases are never seeded.",
  );
const client = new PrismaClient({
  datasources: { db: { url: `file:${target.replaceAll("\\", "/")}` } },
});
async function main() {
  try {
    await addFareCase(client);
    console.log(
      "RT-002 added without modifying RT-001 or existing records in the disposable database.",
    );
  } finally {
    await client.$disconnect();
  }
}
void main().catch(() => {
  console.error("Fare fixture could not be added; no credentials are logged.");
  process.exitCode = 1;
});
