import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";

declare global {
  // eslint-disable-next-line no-var
  var __rydetrue_prisma: PrismaClient | undefined;
}

const local: PrismaClient =
  global.__rydetrue_prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__rydetrue_prisma = local;
}

const databaseContext = new AsyncLocalStorage<PrismaClient>();
export const withDatabase = <T>(client: PrismaClient, task: () => T): T =>
  databaseContext.run(client, task);

/** Every existing query, including transactions and agent tools, uses the request's DB. */
export const prisma = new Proxy(local, {
  get(_target, property) {
    const scoped = databaseContext.getStore();
    if (!scoped && process.env.RYDETRUE_PUBLIC_DEMO === "true")
      throw new Error("public_demo_database_context_required");
    const client = scoped ?? local;
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
