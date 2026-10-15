import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createApiClient } from "../src/frontend/lib/api-client.ts";
import {
  advocateFindingSchema,
  neutralResolutionSchema,
} from "../src/lib/agents/schemas.ts";
import { RT_001_STAGE_2_GEOTAG } from "../src/lib/cases.ts";
import { RT_002_STAGE_2 } from "../src/lib/fare-case.ts";
import { farePresentation } from "../src/frontend/lib/fare-presentation.ts";
import {
  currentInvestigation,
  canReview,
  resolveCitationId,
} from "../src/frontend/lib/view-model.ts";

const mode = process.argv.includes("--groq") ? "groq" : "mock";
const meta = JSON.parse(
  readFileSync(`qa/two-category-last-${mode}.json`, "utf8"),
);
const qa = path.resolve("qa") + path.sep;
if (
  meta.mode !== mode ||
  !meta.database.startsWith(qa) ||
  !meta.trace.startsWith(qa) ||
  !meta.metrics.startsWith(qa)
)
  throw new Error("Disposable configuration required.");
const origin = new URL(meta.origin);
if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1")
  throw new Error("Loopback required.");
const client = new PrismaClient({
  datasources: { db: { url: `file:${meta.database.replaceAll("\\", "/")}` } },
});
const api = createApiClient((input, init) =>
  fetch(new URL(String(input), origin), init),
);
const digest = () =>
  createHash("sha256").update(readFileSync("prisma/dev.db")).digest("hex");
const originalHash = digest();
const report = { mode, passed: false, stages: [] };
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};
function findings(detail) {
  const run = currentInvestigation(detail),
    ids = new Set(detail.evidence.integrity.map((e) => e.id));
  assert(
    run.provider === mode && run.findings.length === 3,
    "provider_or_findings_invalid",
  );
  for (const item of run.findings) {
    const neutral = item.agent === "NEUTRAL_RESOLUTION";
    const parsed = (
      neutral ? neutralResolutionSchema : advocateFindingSchema
    ).parse(item.payload);
    const refs = neutral
      ? [
          ...parsed.citedEvidenceIds,
          ...parsed.agreements.flatMap((p) => p.citedEvidenceIds),
          ...parsed.disagreements.flatMap((p) => p.citedEvidenceIds),
        ]
      : [...parsed.supportingPoints, ...parsed.weakeningPoints].flatMap(
          (p) => p.citedEvidenceIds,
        );
    assert(
      refs.length > 0 && refs.every((id) => ids.has(id)),
      "agent_citations_invalid",
    );
  }
  return run;
}
try {
  // Match unique RT-002 evidence IDs against the disposable DB before any write.
  const local = await client.dispute.findUniqueOrThrow({
    where: { caseCode: "RT-002" },
    include: { evidence: true },
  });
  const remote = await api.getCase("RT-002");
  assert(
    local.evidence.length === remote.evidence.integrity.length &&
      local.evidence.every((e) =>
        remote.evidence.integrity.some((r) => r.id === e.id && r.hashMatches),
      ),
    "api_is_not_disposable_database",
  );
  const html = await (await fetch(new URL("/workspace", origin))).text();
  assert(
    html.includes(
      mode === "groq"
        ? "Groq · live provider selected"
        : "Mock agents · connected API",
    ),
    "mode_label_mismatch",
  );
  for (const code of process.argv.includes("--fare-only")
    ? ["RT-002"]
    : ["RT-001", "RT-002"]) {
    const fare = code === "RT-002",
      policy = fare ? "FARE_RECONCILIATION_SG" : "CANCELLATION_FEE_SG";
    let detail = await api.getCase(code);
    if (!process.argv.includes("--inspect")) {
      assert(
        detail.recommendationHistory.length === 0,
        "fresh_disposable_case_required",
      );
      for (const stage of [1, 2]) {
        if (stage === 2)
          await api.submitEvidence(code, {
            ...(fare ? RT_002_STAGE_2 : RT_001_STAGE_2_GEOTAG),
            actor: "test:two-category-verification",
          });
        const start = Date.now(),
          result = await api.investigate(code, policy);
        report.stages.push({
          caseCode: code,
          stage,
          status: result.status,
          outcome: result.policyRecommendation.outcome,
          refundCents: result.policyRecommendation.refundCents,
          durationMs: Date.now() - start,
          agents: Object.entries(result.agents).map(([role, agent]) => ({
            role,
            status: agent.status,
            durationMs: agent.durationMs,
            toolCallsUsed: agent.toolCallsUsed,
            errorCode:
              agent.error?.match(/Provider error \(([A-Z_0-9]+)\)/)?.[1] ??
              (agent.error ? "agent_validation_or_execution_failure" : null),
          })),
        });
        detail = await api.getCase(code);
        assert(result.status === "COMPLETED", "investigation_not_complete");
        findings(detail);
        const expected =
          stage === 1
            ? 0
            : fare
              ? farePresentation(detail).metrics?.excessCents
              : detail.trip.cancellationFeeCents;
        assert(
          result.policyRecommendation.refundCents === expected &&
            result.policyRecommendation.outcome ===
              (stage === 1
                ? "INSUFFICIENT_EVIDENCE"
                : fare
                  ? "REFUND_PARTIAL"
                  : "REFUND_FULL"),
          "deterministic_result_mismatch",
        );
        assert(canReview(detail) === (stage === 2), "human_gate_invalid");
      }
      await api.approve(code, detail.currentRecommendation.id, {
        decision: "APPROVED",
        actor: "test:two-category-human",
        notes: "Explicit disposable verification; simulated only.",
      });
      detail = await api.getCase(code);
    }
    findings(detail);
    assert(
      detail.recommendationHistory.length === 2 &&
        detail.recommendationHistory[0].outcome === "INSUFFICIENT_EVIDENCE" &&
        detail.currentRecommendation.approvalState === "APPROVED",
      "history_or_approval_invalid",
    );
    assert(
      detail.evidence.integrity.every((e) => e.hashMatches) &&
        detail.currentRecommendation.citations.every(
          (c) =>
            ["policy", "trip"].includes(c.evidenceId) ||
            detail.evidence.integrity.some(
              (e) =>
                e.id ===
                resolveCitationId(c.evidenceId, detail.currentRecommendation),
            ),
        ),
      "evidence_or_policy_citations_invalid",
    );
    assert(
      detail.audit.some((a) => a.action === "SUBMIT_EVIDENCE") &&
        detail.audit.filter((a) => a.action === "APPROVE").length === 1,
      "audit_invalid",
    );
  }
  report.passed = true;
} catch (error) {
  report.failure =
    typeof error?.message === "string" && /^[a-z_]+$/.test(error.message)
      ? error.message
      : "verification_failed";
  process.exitCode = 1;
} finally {
  const lines = (file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((s) => JSON.parse(s));
  const trace = lines(meta.trace),
    metrics = lines(meta.metrics);
  report.groqHttpRequests = trace.length;
  report.successfulGroqCompletions = trace.filter(
    (r) => r.status === 200 && r.validCompletion && r.requestedModelReturned,
  ).length;
  report.rateLimitedRequests = trace.filter((r) => r.status === 429).length;
  report.requestMetrics = metrics;
  report.applicationDatabaseUnchanged = digest() === originalHash;
  if (
    !report.applicationDatabaseUnchanged ||
    (mode === "mock" && trace.length) ||
    (mode === "groq" &&
      report.successfulGroqCompletions <
        (process.argv.includes("--fare-only") ? 6 : 12))
  ) {
    report.passed = false;
    process.exitCode = 1;
  }
  const destination = `qa/two-category-${mode}-verification-${Date.now()}.json`;
  writeFileSync(destination, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Sanitized verification report: ${destination}`);
  await client.$disconnect();
}
