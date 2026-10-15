"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  FileText,
  GitCompareArrows,
  MapPin,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { CaseDetail, PolicyDto, ProviderMode } from "../lib/api-types";
import {
  agentViews,
  currentInvestigation,
  dateTime,
  evidenceRows,
  humanize,
  isSnapshotCurrent,
  money,
  resolveCitationId,
  evidenceLabel,
  evidenceGroupLabel,
  readableFindingText,
  outcomeLabel,
  reviewBlockReason,
  investigationJourney,
} from "../lib/view-model";
import { isFareCase, caseAmountCents } from "../lib/fare-presentation";
import { FareReconciliation } from "./fare-reconciliation";
import { Badge, Button, Panel, SectionTitle } from "./ui";
export function EvidenceReferences({
  ids,
  inspect,
  detail,
}: {
  ids: string[];
  inspect: (id: string) => void;
  detail: CaseDetail;
}) {
  return (
    <div className="evidence-refs connected-refs">
      {[...new Set(ids)].map((id) => (
        <button
          key={id}
          title={`${evidenceLabel(detail, id)} — ${id}`}
          aria-label={`Open ${evidenceLabel(detail, id)} — ${id}`}
          onClick={() => inspect(id)}
        >
          <FileText size={11} />
          <span>{evidenceLabel(detail, id)}</span>
          <ArrowUpRight size={10} />
        </button>
      ))}
    </div>
  );
}
export function PersistedAudit({ detail }: { detail: CaseDetail }) {
  return (
    <Panel className="audit-panel">
      <SectionTitle extra={<Badge>{detail.audit.length} server events</Badge>}>
        A decision you can trace
      </SectionTitle>
      <p className="quiet">
        Persisted backend audit. Actor names are claimed identities; this
        prototype has no authentication.
      </p>
      <div className="audit-list">
        {detail.audit.map((event) => (
          <div key={event.id}>
            <span className="audit-mark">
              <Check size={14} />
            </span>
            <div>
              <strong>{humanize(event.action)}</strong>
              <p>{event.actor}</p>
              <details>
                <summary>View recorded details</summary>
                <pre className="json-block">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </details>
            </div>
            <time>{dateTime(event.createdAt)}</time>
          </div>
        ))}
      </div>
    </Panel>
  );
}
export function ConnectedInvestigation({
  detail,
  policies,
  mode,
  busy,
  investigate,
  retry,
  evaluate,
  addGeotag,
  inspect,
  review,
}: {
  detail: CaseDetail;
  policies: PolicyDto[];
  mode: ProviderMode;
  busy: boolean;
  investigate: () => void;
  retry: () => void;
  evaluate: () => void;
  addGeotag: () => void;
  inspect: (id: string) => void;
  review: (decision: "APPROVED" | "REJECTED") => void;
}) {
  const [tab, setTab] = useState<"investigation" | "audit">("investigation");
  const rec = detail.currentRecommendation;
  const rows = evidenceRows(detail);
  const fare = isFareCase(detail);
  const independentType = fare
    ? "FARE_ADJUSTMENT_RECORD"
    : "THIRD_PARTY_GEOTAG";
  const hasGeotag = rows.some((e) => e.type === independentType);
  const stale = !!rec && !isSnapshotCurrent(detail);
  const agents = agentViews(detail);
  const run = currentInvestigation(detail);
  const journey = investigationJourney(detail);
  const decisionReason = busy
    ? "An operation is in progress. Wait before making a human decision."
    : reviewBlockReason(detail);
  const providerLabel =
    run.provider === "mock"
      ? "Mock provider · persisted output"
      : run.provider
        ? `Provider: ${run.provider} · see audit`
        : "No agent execution recorded";
  const policy = policies.find(
    (p) => p.code === rec?.policyCode && p.version === rec.policyVersion,
  );
  const policyRule = rec?.citations.find((c) => c.ruleId)?.ruleId;
  const rider = detail.statements.find((s) => s.role === "RIDER");
  const driver = detail.statements.find((s) => s.role === "DRIVER");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVIDENCE FIRST. PEOPLE ALWAYS.</div>
          <h1>
            Investigation workspace<span className="heading-dot">.</span>
          </h1>
          <p>
            Every perspective heard. Every decision grounded in persisted
            evidence.
          </p>
        </div>
        <Badge tone="pink">Connected synthetic case</Badge>
      </div>
      <Panel className="case-summary">
        <span className="case-icon">
          <Scale size={24} />
        </span>
        <div className="case-summary-main">
          <div className="inline">
            <h2>{humanize(detail.category)} dispute</h2>
            <Badge tone={detail.status === "APPROVED" ? "green" : "amber"}>
              {humanize(detail.status)}
            </Badge>
          </div>
          <p>
            <strong>{detail.caseCode}</strong>
            <span>·</span>
            {detail.trip.pickup.label}
            <span>·</span>
            {dateTime(detail.trip.cancelledAt || detail.openedAt)}
          </p>
        </div>
        <div className="disputed-amount">
          <span>{fare ? "CHARGED FARE" : "DISPUTED AMOUNT"}</span>
          <strong>{money(caseAmountCents(detail))}</strong>
        </div>
      </Panel>
      <FareReconciliation detail={detail} />
      <div className="workspace-tabs">
        <div className="tab-group" aria-label="Workspace sections">
          <button
            aria-pressed={tab === "investigation"}
            className={tab === "investigation" ? "active" : ""}
            onClick={() => setTab("investigation")}
          >
            <Sparkles size={16} />
            Investigation
          </button>
          <button
            aria-pressed={tab === "audit"}
            className={tab === "audit" ? "active" : ""}
            onClick={() => setTab("audit")}
          >
            <Clock3 size={16} />
            Audit trail<span className="count">{detail.audit.length}</span>
          </button>
        </div>
        <span className="quiet small">
          <span className="green-dot" />
          {providerLabel}
        </span>
      </div>
      {tab === "audit" ? (
        <PersistedAudit detail={detail} />
      ) : (
        <>
          <ol
            className="investigation-journey"
            aria-label="Investigation journey"
          >
            {journey.map((step, index) => (
              <li
                key={step.title}
                className={
                  step.complete
                    ? "complete"
                    : step.current
                      ? "current"
                      : "waiting"
                }
                aria-current={step.current ? "step" : undefined}
              >
                <span className="journey-number">
                  {step.complete ? <Check size={15} /> : `0${index + 1}`}
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <div
            className={`update-banner ${rec?.sufficiencyState === "SUFFICIENT" && !stale ? "evaluated" : ""}`}
          >
            <span className="banner-icon">
              <Sparkles size={21} />
            </span>
            <div>
              <strong>
                {!rec
                  ? "Start with both sides of the story."
                  : stale
                    ? "New evidence is waiting to be evaluated."
                    : ["APPROVED", "REJECTED"].includes(rec.approvalState)
                      ? "Human decision recorded."
                      : rec.sufficiencyState === "SUFFICIENT"
                        ? "Evidence assessed. A person decides."
                        : "Evidence gaps remain."}
              </strong>
              <p>
                {!rec
                  ? "Run the backend investigation. No evidence or decision is submitted automatically."
                  : stale
                    ? "The current recommendation predates the latest evidence. Reinvestigate before any human decision."
                    : rec.sufficiencyState === "SUFFICIENT"
                      ? "Review the server findings, cited evidence and policy before making a human decision."
                      : rec.rationale}
              </p>
            </div>
            <Button disabled={busy} onClick={investigate}>
              {busy
                ? "Processing…"
                : rec
                  ? "Run reinvestigation"
                  : "Run initial investigation"}
              <ArrowRight size={15} />
            </Button>
          </div>
          <div className="integration-tools">
            {mode === "groq" &&
              run.provider === "groq" &&
              !stale &&
              run.completion?.payload.status === "ESCALATED" &&
              rec &&
              ["PENDING", "NOT_APPLICABLE"].includes(rec.approvalState) && (
                <Button variant="secondary" disabled={busy} onClick={retry}>
                  Retry failed agents
                </Button>
              )}
            <Badge tone={mode === "mock" ? "pink" : "amber"}>
              {mode === "mock"
                ? "Mock agents · real HTTP + SQLite persistence"
                : mode === "unconfigured"
                  ? "Provider not configured · execution may escalate"
                  : "Groq selected · live inference · no mock fallback"}
            </Badge>
            <Button variant="secondary" disabled={busy} onClick={evaluate}>
              Evaluate policy only
              <ShieldCheck size={14} />
            </Button>
          </div>
          {run.completion?.payload.status === "ESCALATED" && (
            <div className="error-banner" role="alert">
              Investigation escalated. One or more agents failed. The
              deterministic policy result is shown separately; no finding has
              been fabricated.
            </div>
          )}
          <div className="investigation-grid">
            <div className="main-investigation">
              <SectionTitle
                extra={
                  <span className="quiet small">
                    Advisory findings · deterministic policy governs
                  </span>
                }
              >
                A fair view from every side
              </SectionTitle>
              <div className="agent-grid">
                {agents.map((agent, i) => (
                  <Panel
                    key={agent.role}
                    className={`agent-card ${["rider", "driver", "neutral"][i]}`}
                  >
                    <div className="agent-top">
                      <span
                        className={`agent-avatar ${["rider", "driver", "neutral"][i]}`}
                      >
                        {i === 0 ? (
                          <UserRound size={22} />
                        ) : i === 1 ? (
                          <ShieldCheck size={22} />
                        ) : (
                          <Scale size={22} />
                        )}
                      </span>
                      <span className="agent-number">0{i + 1}</span>
                    </div>
                    <h3>{agent.title}</h3>
                    <span className="agent-label">
                      {
                        [
                          "REPRESENT THE RIDER",
                          "REPRESENT THE DRIVER",
                          "WEIGH & RECONCILE",
                        ][i]
                      }
                    </span>
                    <p className="agent-purpose">
                      {
                        [
                          "Tests the rider’s account against the evidence, including what weakens it.",
                          "Tests the driver’s account independently, including conflicting evidence.",
                          "Reconciles both findings and explains the deterministic policy result.",
                        ][i]
                      }
                    </p>
                    <div className="agent-divider" />
                    <span className="finding-label">
                      <span
                        className={
                          agent.status === "COMPLETED"
                            ? "green-dot"
                            : "amber-dot"
                        }
                      />
                      {humanize(agent.status)}
                      {agent.uncertainty
                        ? ` · ${agent.uncertainty.toLowerCase()} uncertainty`
                        : ""}
                    </span>
                    <p className="agent-summary">
                      {readableFindingText(detail, agent.summary)}
                    </p>
                    {agent.finding && (
                      <details className="agent-reasoning">
                        <summary>
                          {i === 2
                            ? "Agreements & disagreements"
                            : "Supporting & challenging evidence"}
                        </summary>
                        {("supportingPoints" in agent.finding
                          ? [
                              {
                                label: "Supports this account",
                                points: agent.finding.supportingPoints,
                              },
                              {
                                label: "Challenges this account",
                                points: agent.finding.weakeningPoints,
                              },
                            ]
                          : [
                              {
                                label: "Where the agents agree",
                                points: agent.finding.agreements,
                              },
                              {
                                label: "Where they disagree",
                                points: agent.finding.disagreements,
                              },
                            ]
                        ).map((group) => (
                          <div
                            className="agent-evidence-group"
                            key={group.label}
                          >
                            <strong>{group.label}</strong>
                            {group.points.length ? (
                              group.points.map((point, pointIndex) => (
                                <div key={pointIndex}>
                                  <p>
                                    {readableFindingText(
                                      detail,
                                      "claim" in point
                                        ? point.claim
                                        : point.point,
                                    )}
                                  </p>
                                  <EvidenceReferences
                                    detail={detail}
                                    ids={point.citedEvidenceIds}
                                    inspect={inspect}
                                  />
                                </div>
                              ))
                            ) : (
                              <p>No points recorded in this finding.</p>
                            )}
                          </div>
                        ))}
                      </details>
                    )}
                    {agent.reusedFromInvestigationId && (
                      <p className="quiet small">
                        Reused validated finding · unchanged inputs
                      </p>
                    )}
                    <EvidenceReferences
                      detail={detail}
                      ids={agent.refs}
                      inspect={inspect}
                    />
                    {agent.finding && (
                      <details className="finding-details">
                        <summary>Original finding & citation IDs</summary>
                        <pre className="json-block">
                          {JSON.stringify(agent.finding, null, 2)}
                        </pre>
                      </details>
                    )}
                  </Panel>
                ))}
              </div>
              <Panel className="conflict-panel">
                <SectionTitle
                  extra={
                    <Badge
                      tone={
                        rec?.sufficiencyState === "SUFFICIENT" && !stale
                          ? "green"
                          : "amber"
                      }
                    >
                      {rec?.sufficiencyState === "SUFFICIENT" && !stale
                        ? "Evidence available"
                        : "Unresolved"}
                    </Badge>
                  }
                >
                  <GitCompareArrows size={17} />
                  The point of disagreement
                </SectionTitle>
                <div className="claims connected-claims">
                  <div>
                    <span className="claim-label">
                      RIDER’S PERSISTED ACCOUNT
                    </span>
                    <p>
                      “{rider?.text || "No rider statement has been recorded."}”
                    </p>
                  </div>
                  <span className="claims-vs">vs</span>
                  <div>
                    <span className="claim-label">
                      DRIVER’S PERSISTED ACCOUNT
                    </span>
                    <p>
                      “
                      {driver?.text || "No driver statement has been recorded."}
                      ”
                    </p>
                  </div>
                </div>
                <div className="conflict-insight">
                  <MapPin size={17} />
                  <p>
                    <strong>
                      {hasGeotag
                        ? fare
                          ? "Pricing audit is now recorded."
                          : "Independent location context is now present."
                        : fare
                          ? "Verified permitted extras are not yet established."
                          : "Independent geotag not yet recorded."}
                    </strong>{" "}
                    {rec
                      ? rec.rationale
                      : "The backend will check evidence sufficiency before applying any policy."}
                  </p>
                </div>
              </Panel>
              <Panel className="policy-panel">
                <SectionTitle extra={<Badge>Fictional backend policy</Badge>}>
                  <ShieldCheck size={18} />
                  Policy evaluation
                </SectionTitle>
                <div className="policy-row">
                  <span className="policy-code">
                    {rec
                      ? `${rec.policyCode} v${rec.policyVersion}`
                      : "Not evaluated"}
                  </span>
                  <div>
                    <strong>{policyRule || "No rule applied"}</strong>
                    <p>
                      {policy?.rules.rules.find((r) => r.id === policyRule)
                        ?.description ||
                        (rec?.sufficiencyState !== "SUFFICIENT"
                          ? "Policy evaluation is gated until the evidence is sufficient."
                          : policy?.description ||
                            "No current policy evaluation.")}
                    </p>
                  </div>
                  <span
                    className={`policy-result ${rec?.sufficiencyState === "SUFFICIENT" ? "pass" : ""}`}
                  >
                    {rec?.sufficiencyState === "SUFFICIENT" ? (
                      <Check size={16} />
                    ) : (
                      <Clock3 size={16} />
                    )}
                    {stale
                      ? "Outdated snapshot"
                      : rec?.sufficiencyState === "SUFFICIENT"
                        ? "Evaluated"
                        : "Gated"}
                  </span>
                </div>
              </Panel>
            </div>
            <aside className="evidence-column">
              <Panel className="timeline-panel">
                <SectionTitle
                  extra={<Badge>{rows.length} current groups</Badge>}
                >
                  Evidence timeline
                </SectionTitle>
                <p className="quiet small">SYNTHETIC RECORDS · TIMES SGT</p>
                <div className="evidence-timeline">
                  {rows.map((row) => (
                    <button
                      className={`evidence-item ${row.type === independentType ? "new-evidence" : ""}`}
                      key={row.refGroup}
                      onClick={() => inspect(row.id)}
                    >
                      <span className="timeline-marker">
                        {row.type === independentType ? (
                          <Sparkles size={14} />
                        ) : (
                          <FileText size={14} />
                        )}
                      </span>
                      <div className="evidence-item-content">
                        <div className="evidence-meta">
                          <span>Version {row.latestVersion}</span>
                          <time>{dateTime(row.latestCapturedAt)}</time>
                        </div>
                        <strong>{evidenceGroupLabel(row.refGroup)}</strong>
                        <p>{humanize(row.type)}</p>
                        <div className="evidence-source">
                          {humanize(row.source)}
                          <ArrowUpRight size={12} />
                        </div>
                        <Badge tone={row.hashMatches ? "green" : "amber"}>
                          {row.hashMatches
                            ? "Hash verified by backend"
                            : "Integrity issue"}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="timeline-footer">
                  <ShieldCheck size={14} />
                  Versioned records · original evidence retained
                </div>
              </Panel>
              <Button
                className="add-evidence-button"
                variant="secondary"
                disabled={
                  busy ||
                  hasGeotag ||
                  !rec ||
                  !["RT-001", "RT-002"].includes(detail.caseCode)
                }
                onClick={addGeotag}
              >
                {hasGeotag
                  ? fare
                    ? "Pricing audit already submitted"
                    : "Geotag already submitted"
                  : fare
                    ? "Submit synthetic pricing audit"
                    : "Submit synthetic geotag"}
                <ArrowUpRight size={14} />
              </Button>
              <p className="quiet evidence-help">
                {detail.caseCode !== "RT-001"
                  ? "The synthetic Stage 2 examples are available for RT-001 and RT-002."
                  : hasGeotag
                    ? fare
                      ? "Pricing audit is recorded. Reinvestigate to evaluate the current snapshot."
                      : "Independent geotag is recorded. Reinvestigate to evaluate the current snapshot."
                    : !rec
                      ? "Run the initial investigation first to demonstrate the evidence gap."
                      : "This action opens a preview. Evidence is saved only after you explicitly submit."}
              </p>
              <div className="human-note">
                <span>
                  <UserRound size={18} />
                </span>
                <div>
                  <strong>Agents advise. People decide.</strong>
                  <p>
                    No real refunds are processed. Approval records a simulated
                    human decision.
                  </p>
                </div>
              </div>
            </aside>
          </div>
          <Panel
            className={`recommendation ${rec?.refundCents ? "refund" : ""}`}
          >
            <div className="recommendation-heading">
              <span className="recommendation-icon">
                <Scale size={23} />
              </span>
              <div>
                <span className="eyebrow">
                  DETERMINISTIC BACKEND RECOMMENDATION
                </span>
                <h2>
                  {rec
                    ? `${outcomeLabel(rec.outcome)}${rec.refundCents ? ` · ${money(rec.refundCents)}` : ""}`
                    : "No recommendation yet"}
                </h2>
                {rec && (
                  <p className="backend-code">
                    Backend code: <code>{rec.outcome}</code>
                  </p>
                )}
              </div>
              <div className="sufficiency">
                <span>Evidence sufficiency</span>
                <strong className="sufficiency-state">
                  {rec?.sufficiencyState === "SUFFICIENT"
                    ? "Sufficient"
                    : rec
                      ? humanize(rec.sufficiencyState)
                      : "Not assessed"}
                </strong>
                <small>
                  {rec?.sufficiencyState || "No backend assessment yet"}
                </small>
              </div>
            </div>
            <p>
              {rec?.rationale ||
                "Run the initial investigation to check sufficiency and produce a recommendation."}
            </p>
            {rec && (
              <EvidenceReferences
                detail={detail}
                ids={rec.citations.map((c) =>
                  resolveCitationId(c.evidenceId, rec),
                )}
                inspect={inspect}
              />
            )}
            <div className="recommendation-actions">
              <span id="decision-eligibility" role="status">
                <ShieldCheck size={14} />
                {decisionReason ||
                  "Ready for human review. Both actions require confirmation and a reason; no money moves."}
              </span>
              <div>
                <Button
                  variant="secondary"
                  disabled={!!decisionReason}
                  aria-describedby="decision-eligibility"
                  onClick={() => review("REJECTED")}
                >
                  Reject recommendation
                </Button>
                <Button
                  disabled={!!decisionReason}
                  aria-describedby="decision-eligibility"
                  onClick={() => review("APPROVED")}
                >
                  <Check size={16} />
                  Review & approve
                </Button>
              </div>
            </div>
          </Panel>
          <div className="workspace-footnote">
            <span>Transparent by design. Evidence-led by default.</span>
            <span>
              <Sparkles size={12} />
              {providerLabel}. No real payment actions.
            </span>
          </div>
        </>
      )}
    </>
  );
}
