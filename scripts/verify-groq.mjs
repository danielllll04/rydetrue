import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "../src/frontend/lib/api-client.ts";
import {
  advocateFindingSchema,
  neutralResolutionSchema,
} from "../src/lib/agents/schemas.ts";
import {
  currentInvestigation,
  resolveCitationId,
} from "../src/frontend/lib/view-model.ts";
import { RT_001_STAGE_2_GEOTAG } from "../src/lib/cases.ts";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mode = process.argv.includes("--mock") ? "mock" : "groq";
const origin =
  process.env.RYDETRUE_VERIFY_ORIGIN ??
  (mode === "groq" ? "http://127.0.0.1:3102" : "http://127.0.0.1:3101");
const targetUrl = new URL(origin);
if (
  targetUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(targetUrl.hostname)
)
  throw new Error("Verification requires a loopback API origin.");
const report = { mode, passed: false, stages: [] };
const directory = path.join(root, "qa");
const destination = path.join(
  directory,
  `${mode}-verification-${Date.now()}.json`,
);
const digest = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
const appDbHash = digest(path.join(root, "prisma/dev.db"));
const api = createApiClient((input, init) =>
  fetch(new URL(String(input), origin), init),
);
let phase = "server_configuration";
function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}
function errorKind(value) {
  return typeof value !== "string"
    ? null
    : /Provider error \(([A-Z_0-9]+)\)/.exec(value)?.[1] ||
        (/timeout/i.test(value)
          ? "timeout"
          : /schema validation/i.test(value)
            ? "schema_validation"
            : /fabricated/i.test(value)
              ? "invalid_citations"
              : /tool calls/i.test(value)
                ? "tool_protocol"
                : "agent_failure");
}
async function inspectRun(
  stage,
  expectedOutcome,
  expectedRefund,
  retryInvestigationId,
) {
  phase = stage;
  const started = Date.now();
  const result = await api.investigate(
    "RT-001",
    "CANCELLATION_FEE_SG",
    retryInvestigationId,
  );
  const ids = new Set(result.evidenceSnapshot.map((e) => e.evidenceId));
  const checks = Object.entries(result.agents).map(([role, agent]) => {
    const parsed =
      role === "neutralResolution"
        ? neutralResolutionSchema.safeParse(agent.finding)
        : advocateFindingSchema.safeParse(agent.finding);
    const refs = !parsed.success
      ? []
      : role === "neutralResolution"
        ? [
            ...parsed.data.citedEvidenceIds,
            ...parsed.data.agreements.flatMap((p) => p.citedEvidenceIds),
            ...parsed.data.disagreements.flatMap((p) => p.citedEvidenceIds),
          ]
        : [
            ...parsed.data.supportingPoints,
            ...parsed.data.weakeningPoints,
          ].flatMap((p) => p.citedEvidenceIds);
    return {
      role,
      status: agent.status,
      schemaValid: parsed.success,
      citationCount: new Set(refs).size,
      citationsValid: refs.length > 0 && refs.every((id) => ids.has(id)),
      toolCallsUsed: agent.toolCallsUsed,
      durationMs: agent.durationMs,
      reusedFromInvestigationId: agent.reusedFromInvestigationId ?? null,
      errorKind: errorKind(agent.error),
      findingHash: parsed.success
        ? createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex")
        : null,
    };
  });
  const detail = await api.getCase("RT-001");
  const run = currentInvestigation(detail);
  const record = {
    stage,
    investigationId: result.investigationId,
    elapsedMs: Date.now() - started,
    status: result.status,
    provider: run.provider,
    outcome: result.policyRecommendation.outcome,
    refundCents: result.policyRecommendation.refundCents,
    approvalState: result.policyRecommendation.approvalState,
    sufficiency: result.sufficiency.state,
    agents: checks,
    persistedFindings: run.findings.length,
    evidenceIntegrityValid:
      detail.evidence.integrity.length > 0 &&
      detail.evidence.integrity.every((e) => e.hashMatches),
    deterministicOutcomeValid:
      result.policyRecommendation.outcome === expectedOutcome &&
      result.policyRecommendation.refundCents === expectedRefund,
    approvalGateValid:
      detail.currentRecommendation?.approvalState ===
      (expectedRefund > 0 ? "PENDING" : "NOT_APPLICABLE"),
    policyDiscrepancyFlagged: detail.audit.some(
      (a) =>
        a.action === "AGENT_POLICY_DISCREPANCY" &&
        a.payload.investigationId === result.investigationId,
    ),
  };
  report.stages.push(record);
  if (
    !checks.every((a) => a.status === "COMPLETED") &&
    result.status === "ESCALATED" &&
    !retryInvestigationId &&
    process.argv.includes("--retry-failed-once") &&
    !checks.some((a) => a.errorKind === "RATE_LIMIT_DEFERRED")
  ) {
    const detail = await inspectRun(
      stage + "_retry",
      expectedOutcome,
      expectedRefund,
      result.investigationId,
    );
    const retryRecord = report.stages.at(-1);
    requireCondition(
      retryRecord.agents
        .filter((a) => a.reusedFromInvestigationId)
        .every(
          (a) =>
            checks.find((old) => old.role === a.role)?.findingHash ===
            a.findingHash,
        ),
      "reused_finding_changed",
    );
    return detail;
  }
  requireCondition(
    checks.every(
      (a) => a.status === "COMPLETED" && a.schemaValid && a.citationsValid,
    ),
    "agent_validation_failed",
  );
  requireCondition(
    checks
      .filter((a) => a.role !== "neutralResolution")
      .every((a) => a.toolCallsUsed > 0),
    "no_verified_evidence_retrieval",
  );
  requireCondition(
    run.provider === mode && run.findings.length === 3,
    "incorrect_provider_or_persistence",
  );
  requireCondition(
    result.policyRecommendation.outcome === expectedOutcome &&
      result.policyRecommendation.refundCents === expectedRefund,
    "deterministic_outcome_mismatch",
  );
  requireCondition(
    detail.evidence.integrity.every((e) => e.hashMatches),
    "evidence_integrity_failed",
  );
  requireCondition(
    detail.currentRecommendation?.approvalState ===
      (expectedRefund > 0 ? "PENDING" : "NOT_APPLICABLE"),
    "approval_gate_failed",
  );
  return detail;
}
try {
  const html = await (await fetch(`${origin}/workspace`)).text();
  requireCondition(
    html.includes(
      mode === "groq"
        ? "Groq · live provider selected"
        : "Mock agents · connected API",
    ),
    "unexpected_ui_mode",
  );
  const initial = await api.getCase("RT-001");
  requireCondition(
    !initial.evidence.groups.some((g) => g.type === "THIRD_PARTY_GEOTAG") &&
      initial.recommendationHistory.length === 0,
    "requires_fresh_disposable_snapshot",
  );
  await inspectRun("initial", "INSUFFICIENT_EVIDENCE", 0);
  phase = "evidence_submission";
  await api.submitEvidence("RT-001", {
    ...RT_001_STAGE_2_GEOTAG,
    actor: `system:${mode}-verification`,
    notes:
      "Explicit synthetic evidence submission in a disposable verification database.",
  });
  const final = await inspectRun("reinvestigation", "REFUND_FULL", 500);
  requireCondition(
    final.recommendationHistory.length === report.stages.length &&
      final.recommendationHistory[0].outcome === "INSUFFICIENT_EVIDENCE",
    "history_not_preserved",
  );
  requireCondition(
    !final.audit.some((a) => a.action === "APPROVE" || a.action === "REJECT") &&
      final.status === "AWAITING_APPROVAL",
    "unexpected_human_decision",
  );
  requireCondition(
    final.currentRecommendation.citations.every(
      (c) =>
        ["policy", "trip"].includes(c.evidenceId) ||
        final.evidence.integrity.some(
          (e) =>
            e.id ===
            resolveCitationId(c.evidenceId, final.currentRecommendation),
        ),
    ),
    "recommendation_citations_invalid",
  );
  const prefix = mode === "groq" ? "groq-trace-" : "mock-trace-";
  const trace = readdirSync(directory)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".jsonl"))
    .sort()
    .at(-1);
  const records =
    trace && existsSync(path.join(directory, trace))
      ? readFileSync(path.join(directory, trace), "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  report.groqHttpRequests = records.length;
  report.successfulGroqCompletions = records.filter(
    (r) =>
      r.status === 200 &&
      r.validCompletion &&
      r.requestedModelReturned &&
      r.completionId,
  ).length;
  requireCondition(
    mode === "groq"
      ? report.successfulGroqCompletions >= 6
      : records.length === 0,
    "network_provenance_check_failed",
  );
  report.humanApprovalStillRequired = true;
  report.passed = true;
} catch (error) {
  report.failurePhase = phase;
  // Only our fixed assertion/error codes are emitted, never responses or keys.
  report.failure =
    typeof error?.code === "string" && /^[a-zA-Z0-9_]+$/.test(error.code)
      ? error.code
      : /^[a-z_]+$/.test(error?.message || "")
        ? error.message
        : "verification_failed";
  process.exitCode = 1;
} finally {
  if (mode === "groq") {
    const metricsName = readdirSync(directory)
      .filter(
        (name) => name.startsWith("groq-metrics-") && name.endsWith(".jsonl"),
      )
      .sort()
      .at(-1);
    const metrics = metricsName
      ? readFileSync(path.join(directory, metricsName), "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map(JSON.parse)
      : [];
    report.perAgentMeasurements = report.stages.flatMap((stage) =>
      stage.agents.map((agent) => {
        const role = {
          riderAdvocate: "RIDER_ADVOCATE",
          driverAdvocate: "DRIVER_ADVOCATE",
          neutralResolution: "NEUTRAL_RESOLUTION",
        }[agent.role];
        const attempts = metrics.filter(
          (row) =>
            row.investigationId === stage.investigationId && row.agent === role,
        );
        return {
          stage: stage.stage,
          agent: role,
          attempts: attempts.length,
          logicalRequests: new Set(attempts.map((row) => row.logicalRequestId))
            .size,
          completions: attempts.filter((row) => row.status === 200).length,
          rateLimits: attempts.filter((row) => row.status === 429).length,
          promptTokens: attempts.reduce(
            (n, row) => n + (row.promptTokens ?? 0),
            0,
          ),
          completionTokens: attempts.reduce(
            (n, row) => n + (row.completionTokens ?? 0),
            0,
          ),
          usageUnavailableAttempts: attempts.filter(
            (row) => row.promptTokens === null,
          ).length,
          httpResponseMs: attempts.reduce((n, row) => n + row.durationMs, 0),
          quotaWaitMs: attempts.reduce((n, row) => n + row.quotaWaitMs, 0),
          agentElapsedMs: agent.durationMs,
          reused: !!agent.reusedFromInvestigationId,
          rateLimitKinds: [
            ...new Set(
              attempts.map((row) => row.rateLimitKind).filter(Boolean),
            ),
          ],
        };
      }),
    );
  }
  // Include genuine HTTP provenance even when agent or output checks fail.
  const prefix = mode === "groq" ? "groq-trace-" : "mock-trace-";
  const trace = readdirSync(directory)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".jsonl"))
    .sort()
    .at(-1);
  const records = trace
    ? readFileSync(path.join(directory, trace), "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  report.groqHttpRequests = records.length;
  report.successfulGroqCompletions = records.filter(
    (r) =>
      r.status === 200 &&
      r.validCompletion &&
      r.requestedModelReturned &&
      r.completionId,
  ).length;
  report.rateLimitedRequests = records.filter((r) => r.status === 429).length;
  report.applicationDatabaseUnchanged =
    digest(path.join(root, "prisma/dev.db")) === appDbHash;
  if (!report.applicationDatabaseUnchanged) {
    report.passed = false;
    process.exitCode = 1;
  }
  writeFileSync(destination, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Sanitized report saved under qa/${path.basename(destination)}.`);
}
