import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.resolve(process.env.RYDETRUE_QA_DATABASE || "");
if (!target.startsWith(path.join(root, "qa") + path.sep))
  throw new Error("QA database must stay within the isolated qa directory.");
globalThis.__rydetrue_prisma = new PrismaClient({
  datasources: { db: { url: `file:${target.replaceAll("\\", "/")}` } },
});
