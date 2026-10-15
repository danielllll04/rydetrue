import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createApiClient } from "../src/frontend/lib/api-client.ts";
import {
  currentInvestigation,
  canReview,
} from "../src/frontend/lib/view-model.ts";
import {
  advocateFindingSchema,
  neutralResolutionSchema,
} from "../src/lib/agents/schemas.ts";
import { RT_001_STAGE_2_GEOTAG } from "../src/lib/cases.ts";
import { RT_002_STAGE_2 } from "../src/lib/fare-case.ts";
const origin = process.env.VERIFY_ORIGIN ?? "http://127.0.0.1:10000";
const url = new URL(origin);
assert(
  ["127.0.0.1", "localhost"].includes(url.hostname),
  "Verification writes require loopback",
);
const jar = (initial = "") => {
  let cookie = initial;
  const transport = async (input, init = {}) => {
    const response = await fetch(new URL(String(input), origin), {
      ...init,
      headers: { ...init.headers, origin, cookie },
    });
    if (response.headers.has("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return response;
  };
  return {
    api: createApiClient(transport),
    raw: transport,
    cookie: () => cookie,
  };
};
const checkFindings = (d) => {
  const run = currentInvestigation(d),
    ids = new Set(d.evidence.integrity.map((e) => e.id));
  assert.equal(run.provider, "mock");
  assert.equal(run.findings.length, 3);
  for (const f of run.findings) {
    let refs;
    if (f.agent === "NEUTRAL_RESOLUTION") {
      const p = neutralResolutionSchema.parse(f.payload);
      refs = [
        ...p.citedEvidenceIds,
        ...p.agreements.flatMap((x) => x.citedEvidenceIds),
        ...p.disagreements.flatMap((x) => x.citedEvidenceIds),
      ];
    } else {
      const p = advocateFindingSchema.parse(f.payload);
      refs = [...p.supportingPoints, ...p.weakeningPoints].flatMap(
        (x) => x.citedEvidenceIds,
      );
    }
    assert(
      refs.length && refs.every((id) => ids.has(id)),
      "Actual citations must resolve",
    );
  }
  assert(d.evidence.integrity.every((e) => e.hashMatches));
};
await mkdir("qa", { recursive: true });
if (process.argv.includes("--after-restart")) {
  const saved = JSON.parse(
    await readFile("qa/public-restart-cookie.json", "utf8"),
  );
  assert.equal(saved.origin, origin);
  const visitor = jar(saved.cookie);
  assert.equal((await visitor.raw("/api/cases/RT-001")).status, 401);
  await visitor.api.ensureDemoSession();
  for (const code of ["RT-001", "RT-002"]) {
    const d = await visitor.api.getCase(code);
    assert.equal(d.status, "OPEN");
    assert.equal(d.recommendationHistory.length, 0);
  }
  console.log(
    "PASS: restart invalidates the old cookie; both cases reinitialize from tracked fixtures.",
  );
} else {
  const root = await fetch(origin, { redirect: "manual" });
  assert([307, 308].includes(root.status));
  assert.equal(
    new URL(root.headers.get("location"), origin).pathname,
    "/workspace",
  );
  const html = await (await fetch(new URL("/workspace", origin))).text();
  assert(html.includes("Mock agents · connected API"));
  const a = jar(),
    b = jar();
  await Promise.all([a.api.ensureDemoSession(), b.api.ensureDemoSession()]);
  assert.notEqual(a.cookie(), b.cookie());
  for (const code of ["RT-001", "RT-002"]) {
    const fare = code === "RT-002",
      policy = fare ? "FARE_RECONCILIATION_SG" : "CANCELLATION_FEE_SG";
    const results = await Promise.all([
      a.api.investigate(code, policy),
      b.api.investigate(code, policy),
    ]);
    assert(
      results.every(
        (r) =>
          r.status === "COMPLETED" &&
          r.policyRecommendation.outcome === "INSUFFICIENT_EVIDENCE",
      ),
    );
    for (const [visitor, decision] of [
      [a, "APPROVED"],
      [b, "REJECTED"],
    ]) {
      let d = await visitor.api.getCase(code);
      checkFindings(d);
      assert(!canReview(d));
      await visitor.api.submitEvidence(code, {
        ...(fare ? RT_002_STAGE_2 : RT_001_STAGE_2_GEOTAG),
        actor: "judge:test",
      });
      const result = await visitor.api.investigate(code, policy);
      assert.equal(result.status, "COMPLETED");
      d = await visitor.api.getCase(code);
      checkFindings(d);
      assert(canReview(d));
      assert.equal(
        d.currentRecommendation.outcome,
        fare ? "REFUND_PARTIAL" : "REFUND_FULL",
      );
      assert.equal(d.currentRecommendation.refundCents, fare ? 600 : 500);
      await visitor.api.approve(code, d.currentRecommendation.id, {
        decision,
        actor: "judge:test",
        notes: "Disposable presentation verification; simulated decision.",
      });
      d = await visitor.api.getCase(code);
      assert.equal(d.currentRecommendation.approvalState, decision);
      assert.equal(d.recommendationHistory.length, 2);
      assert(
        d.audit.some(
          (e) => e.action === (decision === "APPROVED" ? "APPROVE" : "REJECT"),
        ),
      );
      if (visitor === a) {
        const isolated = await b.api.getCase(code);
        assert.equal(
          isolated.currentRecommendation.outcome,
          "INSUFFICIENT_EVIDENCE",
        );
        assert.equal(
          isolated.evidence.integrity.length,
          d.evidence.integrity.length - 1,
        );
      }
    }
    console.log(
      `PASS: ${code}, two visitors, both stages, three validated mock findings/citations, isolated approval/rejection and audit history.`,
    );
  }
  await a.api.resetDemoSession();
  assert.equal((await a.api.getCase("RT-001")).recommendationHistory.length, 0);
  assert.equal(
    (await b.api.getCase("RT-001")).currentRecommendation.approvalState,
    "REJECTED",
  );
  await writeFile(
    "qa/public-restart-cookie.json",
    JSON.stringify({ origin, cookie: b.cookie() }),
  );
  console.log(
    "PASS: reset affects only its visitor. Restart the public server, then run this verifier with --after-restart.",
  );
}
