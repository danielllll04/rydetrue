import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { withDatabase } from "./db";
import { initializeDemo } from "./fixtures/initialize-demo";
import { hashPayload } from "./evidence";
import { RT_001_STAGE_2_GEOTAG } from "./cases";
import { RT_002_STAGE_2 } from "./fare-case";

export const publicDemoEnabled = () =>
  process.env.RYDETRUE_PUBLIC_DEMO === "true";
const COOKIE = "rydetrue_demo";
const TTL = 30 * 60_000;
const MAX_SESSIONS = 32;
const MAX_ACTIVE = 8;
type Session = {
  resetting?: boolean;
  file: string;
  expires: number;
  active: number;
  writes: Set<string>;
  requests: number[];
  mutations: number;
};
type State = {
  root: string;
  template: string;
  sessions: Map<string, Session>;
  creations: number[];
  active: number;
};
// One shared registry across Next's separately bundled route modules. Cookie IDs
// are random capabilities; never accept database paths or client-chosen IDs.
const registry = globalThis as typeof globalThis & {
  __rydePublicState?: Promise<State>;
};
async function state(): Promise<State> {
  registry.__rydePublicState ??= (async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rydetrue-public-"));
    const template = path.join(root, "template.db");
    const client = new PrismaClient({
      datasources: { db: { url: `file:${template.replaceAll("\\", "/")}` } },
    });
    try {
      await initializeDemo(client);
    } finally {
      await client.$disconnect();
    }
    return { root, template, sessions: new Map(), creations: [], active: 0 };
  })();
  return registry.__rydePublicState;
}
function failure(error: string, status: number) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
function cookie(req: NextRequest) {
  return req.cookies.get(COOKIE)?.value;
}
function resolve(s: State, req: NextRequest) {
  const id = cookie(req);
  const session =
    id && /^[a-f0-9]{64}$/.test(id) ? s.sessions.get(id) : undefined;
  return session && session.expires > Date.now()
    ? { id: id!, session }
    : undefined;
}
function unsafeOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (req.headers.get("sec-fetch-site") === "cross-site") return true;
  if (!origin) return req.method !== "GET";
  try {
    return new URL(origin).host !== req.headers.get("host");
  } catch {
    return true;
  }
}
export async function demoSession(req: NextRequest, reset = false) {
  if (!publicDemoEnabled()) return failure("public_demo_disabled", 404);
  if (unsafeOrigin(req)) return failure("same_origin_required", 403);
  const s = await state();
  const current = resolve(s, req);
  if (current && !reset)
    return NextResponse.json(
      { publicDemo: true, provider: "mock", temporary: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  if (current?.session.active || current?.session.resetting)
    return failure("demo_busy", 409);
  // Expiration never removes a database while an API request still uses it.
  for (const [id, item] of s.sessions)
    if (item.expires <= Date.now() && !item.active) {
      s.sessions.delete(id);
      await rm(item.file, { force: true });
    }
  s.creations = s.creations.filter((t) => t > Date.now() - 3_600_000);
  if (
    s.creations.length >= 60 ||
    s.creations.filter((t) => t > Date.now() - 60_000).length >= 12 ||
    s.sessions.size >= MAX_SESSIONS
  )
    return failure("demo_capacity_reached", 429);
  // Reserve capacity before asynchronous file IO to prevent creation races.
  const id = randomBytes(32).toString("hex");
  const session: Session = {
    file: path.join(s.root, `${id}.db`),
    expires: Date.now() + TTL,
    active: 1,
    writes: new Set(),
    requests: [],
    mutations: 0,
  };
  s.sessions.set(id, session);
  s.creations.push(Date.now());
  if (current) current.session.resetting = true;
  try {
    await copyFile(s.template, session.file);
  } catch {
    s.sessions.delete(id);
    return failure("demo_initialization_failed", 503);
  } finally {
    session.active = 0;
    if (current) current.session.resetting = false;
  }
  if (current) {
    s.sessions.delete(current.id);
    await rm(current.session.file, { force: true });
  }
  const response = NextResponse.json(
    { publicDemo: true, provider: "mock", temporary: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(req.url).hostname,
  );
  response.cookies.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: !loopback,
    path: "/",
    maxAge: TTL / 1000,
  });
  return response;
}

/** Route boundary only; deterministic evaluation and atomic review stay intact. */
export async function withDemoSession(
  req: NextRequest,
  run: (request: NextRequest) => Promise<NextResponse>,
) {
  if (!publicDemoEnabled()) return run(req);
  if (unsafeOrigin(req)) return failure("same_origin_required", 403);
  const s = await state();
  const found = resolve(s, req);
  if (!found) return failure("demo_session_expired", 401);
  const session = found.session;
  if (session.resetting) return failure("demo_busy", 409);
  session.requests = session.requests.filter((t) => t > Date.now() - 60_000);
  if (session.requests.length >= 120 || s.active >= MAX_ACTIVE)
    return failure("demo_rate_limited", 429);
  session.requests.push(Date.now());
  const mutation = req.method !== "GET";
  const caseCode = new URL(req.url).pathname.split("/")[3];
  if (caseCode && !["RT-001", "RT-002"].includes(caseCode))
    return failure("case_not_found", 404);
  if (mutation && session.writes.has(caseCode))
    return failure("demo_busy", 409);
  if (mutation && session.mutations >= 24)
    return failure("demo_mutation_limit", 429);
  if (mutation) session.writes.add(caseCode);
  session.active++;
  s.active++;
  const client = new PrismaClient({
    datasources: { db: { url: `file:${session.file.replaceAll("\\", "/")}` } },
  });
  try {
    let request = req;
    if (mutation) {
      if (!req.headers.get("content-type")?.startsWith("application/json"))
        return failure("json_required", 415);
      const reader = req.body?.getReader();
      if (!reader) return failure("invalid_request", 400);
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      // Bound chunked as well as Content-Length bodies before JSON parsing.
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes > 16_384) {
          await reader.cancel();
          return failure("request_too_large", 413);
        }
        chunks.push(chunk.value);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new Error();
      } catch {
        return failure("invalid_request", 400);
      }
      body.actor = "reviewer:public-demo";
      if (new URL(req.url).pathname.endsWith("/evidence")) {
        const fixture =
          caseCode === "RT-002" ? RT_002_STAGE_2 : RT_001_STAGE_2_GEOTAG;
        if (
          ["type", "source", "refGroup", "capturedAt"].some(
            (key) => body[key] !== fixture[key as keyof typeof fixture],
          ) ||
          hashPayload(body.payload ?? null) !== hashPayload(fixture.payload)
        )
          return failure("public_demo_fixture_only", 403);
        const duplicate = await client.evidence.findFirst({
          where: { dispute: { caseCode }, refGroup: fixture.refGroup },
        });
        if (duplicate) return failure("demo_evidence_already_submitted", 409);
      }
      request = new NextRequest(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body),
      });
      session.mutations++;
    }
    const response = await withDatabase(client, () => run(request));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    // No raw internal errors, DB paths, or provider configuration in public responses.
    return failure("demo_operation_failed", 503);
  } finally {
    await client.$disconnect();
    session.active--;
    s.active--;
    if (mutation) session.writes.delete(caseCode);
  }
}
