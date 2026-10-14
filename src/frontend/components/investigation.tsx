"use client";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileText,
  GitCompareArrows,
  MapPin,
  MessageSquare,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { evidence } from "@/frontend/lib/fixtures";
import type {
  AuditEvent,
  Decision,
  Evidence,
  EvidenceId,
  Investigation,
  Stage,
} from "@/frontend/lib/types";
import { Badge, Button, Panel, SectionTitle } from "./ui";
import { useState } from "react";
export function InvestigationWorkspace({
  data,
  decision,
  busy,
  audit,
  changeStage,
  review,
  navigate,
  showEvidence,
}: {
  data: Investigation;
  decision: Decision;
  busy: boolean;
  audit: AuditEvent[];
  changeStage: (stage: Stage) => void;
  review: (decision: "approved" | "escalated") => void;
  navigate: () => void;
  showEvidence: (evidence: Evidence) => void;
}) {
  const [tab, setTab] = useState<"investigation" | "audit">("investigation");
  const revised = data.stage === "reinvestigation";
  const refs = (ids: EvidenceId[]) => (
    <div className="evidence-refs">
      {ids.map((id) => (
        <button
          key={id}
          onClick={() => showEvidence(evidence.find((e) => e.id === id)!)}
        >
          <FileText size={11} />
          {id}
          <ArrowUpRight size={10} />
        </button>
      ))}
    </div>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVIDENCE FIRST. PEOPLE ALWAYS.</div>
          <h1>
            Investigation workspace<span className="heading-dot">.</span>
          </h1>
          <p>Every perspective heard. Every decision grounded in evidence.</p>
        </div>
        <Badge tone="pink">
          <span className="live-dot" />
          Synthetic demo
        </Badge>
      </div>
      <Panel className="case-summary">
        <div className="case-icon">
          <Scale size={24} />
        </div>
        <div className="case-summary-main">
          <div className="inline">
            <h2>Cancellation fee dispute</h2>
            <Badge tone="amber">
              {decision === "pending"
                ? "Human review required"
                : decision === "approved"
                  ? "Approved by reviewer"
                  : "Escalated"}
            </Badge>
          </div>
          <p>
            <strong>RT-001</strong>
            <span>·</span>Changi Airport, Terminal 3<span>·</span>12 Oct 2026,
            14:32 SGT
          </p>
        </div>
        <div className="disputed-amount">
          <span>DISPUTED AMOUNT</span>
          <strong>S$5.00</strong>
        </div>
      </Panel>
      <div className="workspace-tabs">
        <div
          className="tab-group"
          role="tablist"
          aria-label="Case workspace"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "investigation"
                : event.key === "End"
                  ? "audit"
                  : tab === "investigation"
                    ? "audit"
                    : "investigation";
            setTab(next);
            event.currentTarget
              .querySelectorAll<HTMLButtonElement>("button")
              [next === "investigation" ? 0 : 1].focus();
          }}
        >
          <button
            role="tab"
            id="investigation-tab"
            aria-controls="workspace-content"
            tabIndex={tab === "investigation" ? 0 : -1}
            aria-selected={tab === "investigation"}
            className={tab === "investigation" ? "active" : ""}
            onClick={() => setTab("investigation")}
          >
            <Sparkles size={16} />
            Investigation
          </button>
          <button
            role="tab"
            id="audit-tab"
            aria-controls="workspace-content"
            tabIndex={tab === "audit" ? 0 : -1}
            aria-selected={tab === "audit"}
            className={tab === "audit" ? "active" : ""}
            onClick={() => setTab("audit")}
          >
            <Clock3 size={16} />
            Audit trail<span className="count">{audit.length}</span>
          </button>
        </div>
        <span className="quiet small">
          <span className="green-dot" />
          Fixture snapshot · {revised ? "v2" : "v1"}
        </span>
      </div>
      <div
        id="workspace-content"
        role="tabpanel"
        aria-labelledby={tab === "audit" ? "audit-tab" : "investigation-tab"}
      >
        {tab === "audit" ? (
          <Panel className="audit-panel">
            <SectionTitle extra={<Badge>Session only</Badge>}>
              A decision you can trace
            </SectionTitle>
            <p className="quiet">
              A transparent record of demo actions. No backend audit entries are
              written.
            </p>
            <div className="audit-list">
              {audit.map((item) => (
                <div key={item.id}>
                  <span className="audit-mark">
                    <Check size={14} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <time>{item.time}</time>
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <>
            <div className={`update-banner ${revised ? "evaluated" : ""}`}>
              <span className="banner-icon">
                {revised ? <CheckCheck size={21} /> : <Sparkles size={21} />}
              </span>
              <div>
                <strong>
                  {revised
                    ? "New evidence. A clearer picture."
                    : "A new piece of the picture is here."}
                </strong>
                <p>
                  {revised
                    ? "E-004 resolves the entrance mismatch. Compare the updated findings below."
                    : "E-004 adds entrance-level context. Revisit the case with all four evidence records."}
                </p>
              </div>
              <Button
                variant={revised ? "secondary" : "primary"}
                disabled={busy}
                onClick={() =>
                  changeStage(revised ? "initial" : "reinvestigation")
                }
              >
                {busy
                  ? "Loading fixture…"
                  : revised
                    ? "View initial findings"
                    : "Run demo reinvestigation"}
                {revised ? (
                  <GitCompareArrows size={15} />
                ) : (
                  <ArrowRight size={15} />
                )}
              </Button>
            </div>
            <div className="investigation-grid">
              <div className="main-investigation">
                <SectionTitle
                  extra={
                    <span className="quiet small">
                      3 perspectives · 1 shared evidence set
                    </span>
                  }
                >
                  A fair view from every side
                </SectionTitle>
                <div className="agent-grid">
                  {data.findings.map((finding, i) => (
                    <Panel
                      key={finding.role}
                      className={`agent-card ${finding.role}`}
                    >
                      <div className="agent-top">
                        <span className={`agent-avatar ${finding.role}`}>
                          {i === 2 ? (
                            <Scale size={22} />
                          ) : i === 0 ? (
                            <UserRound size={22} />
                          ) : (
                            <ShieldCheck size={22} />
                          )}
                        </span>
                        <span className="agent-number">0{i + 1}</span>
                      </div>
                      <h3>{finding.title}</h3>
                      <span className="agent-label">
                        {i === 2
                          ? "WEIGH & RECONCILE"
                          : i === 0
                            ? "REPRESENT THE RIDER"
                            : "REPRESENT THE DRIVER"}
                      </span>
                      <div className="agent-divider" />
                      <span className="finding-label">
                        <span className={revised ? "green-dot" : "amber-dot"} />
                        {revised ? "Updated demo finding" : "Demo finding"}
                      </span>
                      <p>{finding.finding}</p>
                      {refs(finding.refs)}
                    </Panel>
                  ))}
                </div>
                <Panel className="conflict-panel">
                  <SectionTitle
                    extra={
                      <Badge tone={revised ? "green" : "amber"}>
                        {revised ? "Conflict explained" : "Unresolved"}
                      </Badge>
                    }
                  >
                    <GitCompareArrows size={17} />
                    The point of disagreement
                  </SectionTitle>
                  <div className="claims">
                    <div>
                      <span className="claim-label">RIDER’S ACCOUNT</span>
                      <p>
                        “I was at Door 6.
                        <br />
                        The driver never arrived.”
                      </p>
                    </div>
                    <span className="claims-vs">vs</span>
                    <div>
                      <span className="claim-label">DRIVER’S ACCOUNT</span>
                      <p>
                        “I arrived and waited.
                        <br />
                        The rider did not appear.”
                      </p>
                    </div>
                  </div>
                  <div className="conflict-insight">
                    <MapPin size={17} />
                    <p>
                      {revised ? (
                        <>
                          <strong>Same terminal, different entrance.</strong>{" "}
                          E-004 places the driver at Door 8. Both accounts of
                          waiting can be true.
                        </>
                      ) : (
                        <>
                          <strong>
                            The missing link: the pickup entrance.
                          </strong>{" "}
                          The original GPS record cannot confirm whether both
                          parties were at Door 6.
                        </>
                      )}
                    </p>
                  </div>
                </Panel>
                <Panel className="policy-panel">
                  <SectionTitle extra={<Badge>Fictional policy</Badge>}>
                    <ShieldCheck size={18} />
                    Policy evaluation
                  </SectionTitle>
                  <div className="policy-row">
                    <span className="policy-code">DEMO-CXL-02</span>
                    <div>
                      <strong>
                        {revised
                          ? "§2.2 · Arrival at the agreed pickup entrance"
                          : "§2.1 · Verify arrival before assigning responsibility"}
                      </strong>
                      <p>
                        {revised
                          ? "A cancellation fee is refundable when evidence supports that the driver waited at an entrance other than the agreed pickup."
                          : "If arrival at the designated pickup cannot be established, request additional evidence. Do not infer responsibility from proximity alone."}
                      </p>
                    </div>
                    <span className={`policy-result ${revised ? "pass" : ""}`}>
                      {revised ? <Check size={17} /> : <Clock3 size={17} />}
                      {revised ? "Supported" : "Unverified"}
                    </span>
                  </div>
                </Panel>
              </div>
              <aside className="evidence-column">
                <Panel className="timeline-panel">
                  <SectionTitle
                    extra={<Badge>{revised ? 4 : 3} evaluated</Badge>}
                  >
                    Evidence timeline
                  </SectionTitle>
                  <p className="quiet small">12 OCT 2026 · ALL TIMES SGT</p>
                  <div className="evidence-timeline">
                    {[...evidence]
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((item, i) => (
                        <button
                          className={`evidence-item ${i === 3 ? "new-evidence" : ""}`}
                          key={item.id}
                          onClick={() => showEvidence(item)}
                        >
                          <span className="timeline-marker">
                            {item.kind === "location" ? (
                              <MapPin size={14} />
                            ) : item.kind === "message" ? (
                              <MessageSquare size={14} />
                            ) : item.kind === "new" ? (
                              <Sparkles size={14} />
                            ) : (
                              <FileText size={14} />
                            )}
                          </span>
                          <div className="evidence-item-content">
                            <div className="evidence-meta">
                              <span>{item.id}</span>
                              <time>{item.time}</time>
                            </div>
                            <strong>{item.title}</strong>
                            <p>{item.description}</p>
                            <div className="evidence-source">
                              {item.source}
                              <ArrowUpRight size={12} />
                            </div>
                            {i === 3 && (
                              <Badge tone="pink">
                                {revised
                                  ? "Included in v2"
                                  : "New · not yet evaluated"}
                              </Badge>
                            )}
                          </div>
                        </button>
                      ))}
                  </div>
                  <div className="timeline-footer">
                    <ShieldCheck size={14} />
                    Synthetic records · no personal data
                  </div>
                </Panel>
                <div className="human-note">
                  <span>
                    <UserRound size={18} />
                  </span>
                  <div>
                    <strong>AI assists. People decide.</strong>
                    <p>
                      Recommendations require an operations reviewer’s approval.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
            <Panel className={`recommendation ${revised ? "refund" : ""}`}>
              <div className="recommendation-heading">
                <span className="recommendation-icon">
                  <Scale size={23} />
                </span>
                <div>
                  <span className="eyebrow">
                    NEUTRAL AGENT · DEMO RECOMMENDATION
                  </span>
                  <h2>{data.recommendation}</h2>
                </div>
                <div className="sufficiency">
                  <span>
                    Evidence sufficiency <strong>{data.sufficiency}%</strong>
                  </span>
                  <div className="meter">
                    <i style={{ width: `${data.sufficiency}%` }} />
                  </div>
                  <small>{data.label} · illustrative score</small>
                </div>
              </div>
              <p>{data.explanation}</p>
              <div className="recommendation-actions">
                <span>
                  <ShieldCheck size={14} />
                  {decision === "pending"
                    ? "Awaiting human approval"
                    : decision === "approved"
                      ? "Approved in this demo session · no refund issued"
                      : "Added to the demo human review queue"}
                </span>
                <div>
                  <Button
                    variant="secondary"
                    disabled={busy || decision !== "pending"}
                    onClick={() => review("escalated")}
                  >
                    Escalate to review
                    <ArrowUpRight size={15} />
                  </Button>
                  <Button
                    disabled={!revised || busy || decision !== "pending"}
                    onClick={() => review("approved")}
                  >
                    <Check size={16} />
                    Approve recommendation
                  </Button>
                  {decision !== "pending" && (
                    <Button variant="ghost" onClick={navigate}>
                      View resolution
                      <ChevronRight size={15} />
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
            <div className="workspace-footnote">
              <span>Transparent by design. Evidence-led by default.</span>
              <span>
                <Sparkles size={12} />
                Prewritten fixture findings. No live AI execution.
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
