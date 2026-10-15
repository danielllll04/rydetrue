import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { demoSession, withDemoSession } from "../src/lib/public-demo";
import { prisma } from "../src/lib/db";
import { GET as getCase } from "../src/app/api/cases/[id]/route";
import { POST as investigate } from "../src/app/api/cases/[id]/investigate/route";
import { POST as evidence } from "../src/app/api/cases/[id]/evidence/route";
import { POST as approve } from "../src/app/api/cases/[id]/recommendations/[recId]/approve/route";
import { RT_001_STAGE_2_GEOTAG } from "../src/lib/cases";
import { RT_002_STAGE_2 } from "../src/lib/fare-case";
import { getProvider } from "../src/lib/agents/provider";
import {
  currentInvestigation,
  canReview,
} from "../src/frontend/lib/view-model";
import {
  advocateFindingSchema,
  neutralResolutionSchema,
} from "../src/lib/agents/schemas";

let a = "",
  b = "";
const request = (
  path: string,
  cookie = "",
  body?: unknown,
  extra: Record<string, string> = {},
) =>
  new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "localhost",
      origin: "http://localhost",
      "content-type": "application/json",
      cookie,
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const context = (id: string, recId?: string) => ({
  params: Promise.resolve({ id, ...(recId ? { recId } : {}) }),
});
const detail = async (cookie: string, id: string) =>
  (await getCase(request(`/api/cases/${id}`, cookie), context(id))).json();
const sessionCookie = (r: NextResponse) =>
  r.headers.get("set-cookie")!.split(";")[0];

describe.sequential(
  "Public mock isolation with fresh disposable databases",
  () => {
    beforeAll(async () => {
      process.env.RYDETRUE_PUBLIC_DEMO = "true";
      a = sessionCookie(
        await demoSession(request("/api/demo/session", "", {})),
      );
      b = sessionCookie(
        await demoSession(request("/api/demo/session", "", {})),
      );
    });
    afterAll(() => {
      delete process.env.RYDETRUE_PUBLIC_DEMO;
      process.env.RYDETRUE_LLM_MODE = "mock";
      vi.restoreAllMocks();
    });
    it("starts both cases from tracked Stage 1 fixtures without local snapshots", async () => {
      expect(a).not.toBe(b);
      for (const id of ["RT-001", "RT-002"]) {
        const d = await detail(a, id);
        expect(d.status).toBe("OPEN");
        expect(d.recommendationHistory).toHaveLength(0);
        expect(
          d.evidence.integrity.every(
            (e: { hashMatches: boolean }) => e.hashMatches,
          ),
        ).toBe(true);
      }
    });
    it("fails closed outside a visitor database context", () => {
      expect(() => prisma.dispute).toThrow(
        "public_demo_database_context_required",
      );
    });
    it("forces mock even if environment selects Groq, and completes both independent multi-agent journeys with zero fetch calls", async () => {
      process.env.RYDETRUE_LLM_MODE = "groq";
      expect(getProvider().name).toBe("mock");
      const network = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Network forbidden"));
      try {
        for (const id of ["RT-001", "RT-002"]) {
          const policyCode =
            id === "RT-002" ? "FARE_RECONCILIATION_SG" : "CANCELLATION_FEE_SG";
          const run = () =>
            investigate(
              request(`/api/cases/${id}/investigate`, a, { policyCode }),
              context(id),
            );
          expect((await run()).status).toBe(200);
          let d = await detail(a, id);
          expect(d.currentRecommendation.outcome).toBe("INSUFFICIENT_EVIDENCE");
          expect(canReview(d)).toBe(false);
          const premature = await approve(
            request(
              `/api/cases/${id}/recommendations/${d.currentRecommendation.id}/approve`,
              a,
              { decision: "APPROVED", actor: "judge" },
            ),
            {
              params: Promise.resolve({
                id,
                recId: d.currentRecommendation.id,
              }),
            },
          );
          expect(premature.status).toBeGreaterThanOrEqual(400);
          expect(
            (
              await evidence(
                request(`/api/cases/${id}/evidence`, a, {
                  ...(id === "RT-002" ? RT_002_STAGE_2 : RT_001_STAGE_2_GEOTAG),
                  actor: "judge",
                }),
                context(id),
              )
            ).status,
          ).toBe(201);
          expect((await run()).status).toBe(200);
          d = await detail(a, id);
          expect(d.currentRecommendation.outcome).toBe(
            id === "RT-002" ? "REFUND_PARTIAL" : "REFUND_FULL",
          );
          expect(d.currentRecommendation.refundCents).toBe(
            id === "RT-002" ? 600 : 500,
          );
          expect(canReview(d)).toBe(true);
          const findings = currentInvestigation(d).findings;
          expect(findings).toHaveLength(3);
          const ids = new Set(
            d.evidence.integrity.map((e: { id: string }) => e.id),
          );
          for (const f of findings) {
            if (f.agent === "NEUTRAL_RESOLUTION") {
              const parsed = neutralResolutionSchema.parse(f.payload);
              expect(parsed.citedEvidenceIds.length).toBeGreaterThan(0);
              expect(parsed.citedEvidenceIds.every((id) => ids.has(id))).toBe(
                true,
              );
            } else {
              const parsed = advocateFindingSchema.parse(f.payload);
              const refs = [
                ...parsed.supportingPoints,
                ...parsed.weakeningPoints,
              ].flatMap((p) => p.citedEvidenceIds);
              expect(refs.length).toBeGreaterThan(0);
              expect(refs.every((id) => ids.has(id))).toBe(true);
            }
          }
          const recId = d.currentRecommendation.id;
          expect(
            (
              await approve(
                request(
                  `/api/cases/${id}/recommendations/${recId}/approve`,
                  a,
                  { decision: "APPROVED", actor: "judge" },
                ),
                { params: Promise.resolve({ id, recId }) },
              )
            ).status,
          ).toBe(200);
          d = await detail(a, id);
          expect(d.currentRecommendation.approvalState).toBe("APPROVED");
          expect(d.recommendationHistory).toHaveLength(2);
          expect(
            d.audit.some((e: { action: string }) => e.action === "APPROVE"),
          ).toBe(true);
          expect((await detail(b, id)).recommendationHistory).toHaveLength(0);
          expect(
            (
              await approve(
                request(
                  `/api/cases/${id}/recommendations/${recId}/approve`,
                  b,
                  { decision: "APPROVED", actor: "judge" },
                ),
                { params: Promise.resolve({ id, recId }) },
              )
            ).status,
          ).toBe(404);
        }
        expect(network).not.toHaveBeenCalled();
      } finally {
        network.mockRestore();
        process.env.RYDETRUE_LLM_MODE = "mock";
      }
    });
    it("rejects forged cookies, unknown cases, cross-origin writes and synthetic-source spoofing", async () => {
      expect(
        (
          await getCase(
            request("/api/cases/RT-001", "rydetrue_demo=" + "a".repeat(64)),
            context("RT-001"),
          )
        ).status,
      ).toBe(401);
      expect(
        (await getCase(request("/api/cases/OTHER", b), context("OTHER")))
          .status,
      ).toBe(404);
      expect(
        (
          await demoSession(
            request(
              "/api/demo/session",
              "",
              {},
              { origin: "https://evil.invalid" },
            ),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await evidence(
            request("/api/cases/RT-002/evidence", b, {
              ...RT_002_STAGE_2,
              payload: { ...RT_002_STAGE_2.payload, caseCode: "WRONG" },
              actor: "judge",
            }),
            context("RT-002"),
          )
        ).status,
      ).toBe(403);
    });
    it("bounds chunked bodies, duplicate evidence and concurrent case mutations", async () => {
      expect(
        (
          await evidence(
            request("/api/cases/RT-001/evidence", b, {
              large: "x".repeat(17000),
            }),
            context("RT-001"),
          )
        ).status,
      ).toBe(413);
      expect(
        (
          await evidence(
            request("/api/cases/RT-001/evidence", a, {
              ...RT_001_STAGE_2_GEOTAG,
              actor: "judge",
            }),
            context("RT-001"),
          )
        ).status,
      ).toBe(409);
      let release!: () => void, entered!: () => void;
      const ready = new Promise<void>((r) => (entered = r)),
        wait = new Promise<void>((r) => (release = r));
      const first = withDemoSession(
        request("/api/cases/RT-001/evaluate", b, {}),
        async () => {
          entered();
          await wait;
          return NextResponse.json({ ok: true });
        },
      );
      await ready;
      expect(
        (
          await withDemoSession(
            request("/api/cases/RT-001/evaluate", b, {}),
            async () => NextResponse.json({ ok: true }),
          )
        ).status,
      ).toBe(409);
      release();
      expect((await first).status).toBe(200);
    });
    it("resets only the current visitor and invalidates their prior cookie", async () => {
      const old = a;
      a = sessionCookie(
        await demoSession(request("/api/demo/reset", a, {}), true),
      );
      expect((await detail(a, "RT-001")).recommendationHistory).toHaveLength(0);
      expect((await detail(b, "RT-002")).status).toBe("OPEN");
      expect(
        (await getCase(request("/api/cases/RT-001", old), context("RT-001")))
          .status,
      ).toBe(401);
    });
    it("bounds per-session requests and writes before executing more work", async () => {
      const limited = sessionCookie(
        await demoSession(request("/api/demo/session", "", {})),
      );
      const handler = vi.fn(async () => NextResponse.json({ ok: true }));
      for (let i = 0; i < 24; i++)
        expect(
          (
            await withDemoSession(
              request("/api/cases/RT-001/evaluate", limited, {}),
              handler,
            )
          ).status,
        ).toBe(200);
      expect(
        (
          await withDemoSession(
            request("/api/cases/RT-001/evaluate", limited, {}),
            handler,
          )
        ).status,
      ).toBe(429);
      expect(handler).toHaveBeenCalledTimes(24);
      const readOnly = sessionCookie(
        await demoSession(request("/api/demo/session", "", {})),
      );
      for (let i = 0; i < 120; i++)
        expect(
          (
            await withDemoSession(
              request("/api/cases/RT-001", readOnly),
              handler,
            )
          ).status,
        ).toBe(200);
      const capped = await withDemoSession(
        request("/api/cases/RT-001", readOnly),
        handler,
      );
      expect(capped.status).toBe(429);
      expect(capped.headers.get("Retry-After")).toBe("60");
    });
    it("rejects reset while requests are active and caps global concurrency", async () => {
      let release!: () => void;
      const wait = new Promise<void>((r) => (release = r));
      const ready: Promise<void>[] = [],
        requests: Promise<NextResponse>[] = [];
      for (let i = 0; i < 8; i++) {
        let entered!: () => void;
        ready.push(new Promise<void>((r) => (entered = r)));
        requests.push(
          withDemoSession(request("/api/cases/RT-001", b), async () => {
            entered();
            await wait;
            return NextResponse.json({ ok: true });
          }),
        );
      }
      await Promise.all(ready);
      try {
        expect(
          (await demoSession(request("/api/demo/reset", b, {}), true)).status,
        ).toBe(409);
        expect(
          (
            await withDemoSession(request("/api/cases/RT-001", a), async () =>
              NextResponse.json({ ok: true }),
            )
          ).status,
        ).toBe(429);
      } finally {
        release();
        await Promise.all(requests);
      }
    });
    it("expires sessions, safely initializes replacements, and bounds concurrent creation", async () => {
      const now = Date.now();
      const time = vi.spyOn(Date, "now").mockReturnValue(now + 3_600_001);
      try {
        expect(
          (await getCase(request("/api/cases/RT-001", a), context("RT-001")))
            .status,
        ).toBe(401);
        const replacement = await demoSession(
          request("/api/demo/session", a, {}),
        );
        expect(replacement.status).toBe(200);
        expect(
          (await detail(sessionCookie(replacement), "RT-002")).status,
        ).toBe("OPEN");
        const responses = await Promise.all(
          Array.from({ length: 25 }, () =>
            demoSession(request("/api/demo/session", "", {})),
          ),
        );
        expect(
          responses.filter((r) => r.status === 200).length,
        ).toBeLessThanOrEqual(11);
        expect(
          responses.some(
            (r) => r.status === 429 && r.headers.get("Retry-After") === "60",
          ),
        ).toBe(true);
      } finally {
        time.mockRestore();
      }
    });
  },
);
