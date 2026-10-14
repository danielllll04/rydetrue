import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoService, validateSubmission } from "./service";
import { evidence } from "./fixtures";
test("new evidence explains the changed recommendation and all references resolve", async () => {
  const api = createDemoService(0);
  const first = await api.getInvestigation("initial");
  const next = await api.getInvestigation("reinvestigation");
  assert.equal(first.recommendation, "Hold for additional evidence");
  assert.match(next.explanation, /Door 8/);
  assert.match(next.explanation, /Door 6/);
  assert.ok(
    next.findings.every((f) =>
      f.refs.every((id) => evidence.some((e) => e.id === id)),
    ),
  );
  assert.ok(next.findings.some((f) => f.refs.includes("E-004")));
});
test("initial evidence cannot be approved; reinvestigation may be approved", async () => {
  const api = createDemoService(0);
  await assert.rejects(
    api.review("approved", "initial"),
    /Additional evidence/,
  );
  assert.equal(
    (await api.review("approved", "reinvestigation")).decision,
    "approved",
  );
});
test("submission validates statements, size, type and file count", () => {
  assert.ok(
    validateSubmission({
      statement: "I waited at the pickup entrance.",
      category: "Cancellation fee",
      files: Array.from({ length: 6 }, (_, i) => ({
        name: `${i}.png`,
        size: 10,
        type: "image/png",
      })),
    }),
  );
  assert.ok(
    validateSubmission({
      statement: "short",
      category: "Cancellation fee",
      files: [],
    }),
  );
  assert.ok(
    validateSubmission({
      statement: "I waited at the pickup entrance.",
      category: "Cancellation fee",
      files: [{ name: "a.exe", size: 1, type: "application/octet-stream" }],
    }),
  );
  assert.ok(
    validateSubmission({
      statement: "I waited at the pickup entrance.",
      category: "Cancellation fee",
      files: [{ name: "a.png", size: 11 * 1024 * 1024, type: "image/png" }],
    }),
  );
  assert.equal(
    validateSubmission({
      statement: "I waited at the pickup entrance.",
      category: "Cancellation fee",
      files: [],
    }),
    null,
  );
});
test("service failure is explicit and fixture reads are independent", async () => {
  await assert.rejects(
    createDemoService(0, true).listCases(),
    /temporarily unavailable/,
  );
  const api = createDemoService(0);
  const list = await api.listCases();
  list[0].id = "changed";
  assert.equal((await api.listCases())[0].id, "RT-001");
});
