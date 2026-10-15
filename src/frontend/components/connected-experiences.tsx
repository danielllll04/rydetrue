"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Filter,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { SubmitEvidenceRequest } from "@/lib/schemas";
import { submitEvidenceRequestSchema } from "@/lib/schemas";
import type { CaseDetail } from "../lib/api-types";
import {
  dateTime,
  evidenceRows,
  humanize,
  isSnapshotCurrent,
  money,
  resolveCitationId,
  outcomeLabel,
} from "../lib/view-model";
import { Badge, Button, EmptyState, Panel, SectionTitle } from "./ui";
import { EvidenceReferences, PersistedAudit } from "./connected-investigation";
import {
  resolutionTitle,
  resolutionDecision,
  resolutionExplanation,
  resolutionHistory,
} from "../lib/resolution-presentation";
export function ConnectedOperations({
  cases,
  open,
}: {
  cases: CaseDetail[];
  open: (code: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [queue, setQueue] = useState(false);
  const needsReview = (item: CaseDetail) =>
    ["PENDING_REVIEW", "AWAITING_APPROVAL"].includes(item.status);
  const filtered = cases.filter(
    (c) =>
      (status === "ALL" || c.status === status) &&
      (category === "ALL" || c.category === category) &&
      (!queue || needsReview(c)) &&
      `${c.caseCode} ${c.trip.pickup.label} ${c.trip.dropoff.label}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">RYDE OPERATIONS · CONNECTED WORKSPACE</div>
          <h1>
            A little clarity. A fairer ride
            <span className="heading-dot">.</span>
          </h1>
          <p>
            Case status, recommendations and review decisions from the backend.
          </p>
        </div>
        <Badge tone="pink">Persisted synthetic data</Badge>
      </div>
      <div className="metrics">
        {[
          {
            label: "Total cases",
            value: cases.length,
            detail: "Retrieved from the backend",
          },
          {
            label: "Needs human review",
            value: cases.filter(needsReview).length,
            detail: "Pending review or approval",
          },
          {
            label: "In progress",
            value: cases.filter((c) =>
              ["OPEN", "REOPENED", "INVESTIGATING"].includes(c.status),
            ).length,
            detail: "Open or investigating",
          },
          {
            label: "Approved / closed",
            value: cases.filter((c) =>
              ["APPROVED", "CLOSED"].includes(c.status),
            ).length,
            detail: "Simulated decisions only",
          },
        ].map((m, i) => (
          <Panel key={m.label} className="metric">
            <span>
              {m.label}
              <span className={`metric-dot metric-${i}`} />
            </span>
            <strong>{m.value.toString().padStart(2, "0")}</strong>
            <p>{m.detail}</p>
          </Panel>
        ))}
      </div>
      <Panel className="case-table-panel">
        <SectionTitle extra={<Badge>{filtered.length} cases</Badge>}>
          Case overview
        </SectionTitle>
        <div className="filters">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search cases"
              placeholder="Search case ID or trip…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Filter status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            {[...new Set(cases.map((c) => c.status))].map((s) => (
              <option value={s} key={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="ALL">All categories</option>
            {[...new Set(cases.map((c) => c.category))].map((c) => (
              <option value={c} key={c}>
                {humanize(c)}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            className={queue ? "selected-filter" : ""}
            aria-pressed={queue}
            onClick={() => setQueue(!queue)}
          >
            <Filter size={14} />
            Human review queue
          </Button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Case / Trip</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Latest outcome</th>
                <th>History</th>
                <th>
                  <span className="sr-only">Open case</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.caseCode}>
                  <td>
                    <button
                      className="case-link"
                      onClick={() => open(item.caseCode)}
                    >
                      {item.caseCode}
                      <ArrowUpRight size={12} />
                    </button>
                    <p>
                      {item.trip.pickup.label}
                      <br />
                      {item.trip.dropoff.label}
                    </p>
                  </td>
                  <td>{humanize(item.category)}</td>
                  <td>
                    <strong>
                      {money(item.trip.cancellationFeeCents || 0)}
                    </strong>
                  </td>
                  <td>
                    <Badge
                      tone={
                        item.status === "APPROVED"
                          ? "green"
                          : needsReview(item)
                            ? "amber"
                            : "muted"
                      }
                    >
                      {humanize(item.status)}
                    </Badge>
                  </td>
                  <td>
                    {item.currentRecommendation ? (
                      <>
                        <span>
                          {outcomeLabel(item.currentRecommendation.outcome)}
                        </span>
                        <small className="backend-code">
                          {item.currentRecommendation.outcome}
                        </small>
                      </>
                    ) : (
                      "Not evaluated"
                    )}
                  </td>
                  <td>{item.recommendationHistory.length} versions</td>
                  <td>
                    <Button
                      variant="ghost"
                      aria-label={`Open ${item.caseCode}`}
                      onClick={() => open(item.caseCode)}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <EmptyState title="No cases match these filters">
            Change the search or filters to see available cases.
          </EmptyState>
        )}
      </Panel>
      <p className="quiet small">
        Review indicators are derived from backend status. No priority field or
        case-creation endpoint is exposed by the current API.
      </p>
    </>
  );
}
export function ConnectedTrip({ detail }: { detail: CaseDetail }) {
  return (
    <div className="trip-summary">
      <div className="trip-top">
        <span>
          <MapPin size={17} />
          PERSISTED TRIP
        </span>
        <strong>
          {money(detail.trip.cancellationFeeCents || 0)}
          <span>cancellation fee</span>
        </strong>
      </div>
      <div className="trip-route">
        <div>
          <i />
          <span>
            {detail.trip.pickup.label}
            <small>Designated pickup</small>
          </span>
        </div>
        <div>
          <i />
          <span>
            {detail.trip.dropoff.label}
            <small>Destination</small>
          </span>
        </div>
      </div>
      <div className="trip-meta">
        {dateTime(detail.trip.cancelledAt || detail.openedAt)}
        <span>{detail.caseCode}</span>
      </div>
    </div>
  );
}
export function ConnectedParty({
  role,
  detail,
  busy,
  submitEvidence,
}: {
  role: "RIDER" | "DRIVER";
  detail: CaseDetail;
  busy: boolean;
  submitEvidence: (body: SubmitEvidenceRequest) => Promise<boolean>;
}) {
  const statements = detail.statements.filter((s) => s.role === role);
  const [payload, setPayload] = useState(
    JSON.stringify(
      {
        type: "GPS_PING",
        trail: [
          {
            at: detail.trip.cancelledAt || detail.openedAt,
            lat: detail.trip.pickup.lat,
            lng: detail.trip.pickup.lng,
            accuracyM: 80,
          },
        ],
      },
      null,
      2,
    ),
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaved(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setError("Enter valid JSON. Nothing has been submitted.");
      return;
    }
    const value = submitEvidenceRequestSchema.safeParse({
      type:
        typeof parsed === "object" && parsed
          ? (parsed as Record<string, unknown>).type
          : "",
      source: role === "RIDER" ? "RIDER_PHONE" : "DRIVER_PHONE",
      refGroup: `${role.toLowerCase()}-submitted-evidence`,
      payload: parsed,
      capturedAt: detail.trip.cancelledAt || detail.openedAt,
      actor: `demo:${role.toLowerCase()}`,
      notes: `Synthetic ${role.toLowerCase()} evidence submitted through the connected frontend.`,
    });
    if (!value.success) {
      setError(
        "Use a documented evidence type and JSON object. Nothing has been submitted.",
      );
      return;
    }
    if (value.data.type === "THIRD_PARTY_GEOTAG") {
      setError(
        "Third-party geotags must be submitted from the reviewer workspace, not attributed to a rider or driver phone.",
      );
      return;
    }
    setSaved(await submitEvidence(value.data));
  }
  return (
    <div className="consumer-shell">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {role} EXPERIENCE · {detail.caseCode}
          </div>
          <h1>
            Your perspective matters<span className="heading-dot">.</span>
          </h1>
          <p>
            Read the recorded account and submit structured synthetic evidence.
          </p>
        </div>
        <Badge tone="pink">Connected data</Badge>
      </div>
      <div className="submission-grid">
        <div>
          <Panel className="submission-form">
            <SectionTitle>
              {role === "RIDER"
                ? "Your recorded statement"
                : "Your recorded response"}
            </SectionTitle>
            {statements.length ? (
              statements.map((s) => (
                <blockquote key={s.id}>
                  <span>
                    {s.authorAlias} · {dateTime(s.submittedAt)}
                  </span>
                  {s.text}
                </blockquote>
              ))
            ) : (
              <p className="quiet">No statement is recorded for this party.</p>
            )}
            {role === "DRIVER" && (
              <>
                <h3>Rider’s allegation</h3>
                <p className="quiet statement-copy">
                  {detail.statements.find((s) => s.role === "RIDER")?.text ||
                    "No rider statement is recorded."}
                </p>
              </>
            )}
            <div className="unsupported-note">
              <ShieldCheck size={17} />
              <p>
                The current API does not support creating or editing statements,
                creating disputes, or uploading files. Those actions are
                disabled; no submission is silently simulated.
              </p>
            </div>
            <label className="field-label" htmlFor="unavailable-statement">
              Statement updates unavailable
            </label>
            <textarea
              id="unavailable-statement"
              disabled
              rows={2}
              placeholder="A documented statement endpoint is required."
            />
            <Button className="disabled-action" disabled>
              Statement submission unavailable
            </Button>
          </Panel>
          <form
            className="panel submission-form connected-evidence-form"
            onSubmit={submit}
          >
            <SectionTitle>Submit structured evidence</SectionTitle>
            <p className="quiet small">
              Synthetic JSON only. Saving creates a versioned record through the
              documented evidence endpoint. This example is a new unverified
              phone GPS record; it does not establish arrival.
            </p>
            <label className="field-label" htmlFor={`${role}-payload`}>
              Evidence JSON
            </label>
            <textarea
              className="code-input"
              id={`${role}-payload`}
              rows={10}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              required
              disabled={busy}
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {saved && (
              <p className="success-note" role="status">
                <CheckCircle2 size={16} />
                Evidence persisted. Refresh or reinvestigate to evaluate its
                effect.
              </p>
            )}
            <div className="submit-footer">
              <span>No file contents are uploaded.</span>
              <Button type="submit" disabled={busy}>
                Submit synthetic evidence
                <ArrowRight size={16} />
              </Button>
            </div>
          </form>
        </div>
        <aside>
          <ConnectedTrip detail={detail} />
          <Panel className="what-next">
            <SectionTitle>Case tracking</SectionTitle>
            <p className="quiet">Current backend status</p>
            <Badge tone="amber">{humanize(detail.status)}</Badge>
            <p className="quiet statement-copy">
              {detail.currentRecommendation
                ? `${outcomeLabel(detail.currentRecommendation.outcome)} · ${humanize(detail.currentRecommendation.approvalState)}`
                : "No recommendation yet."}
            </p>
            <p className="quiet small">
              Additional evidence is preserved. Investigation and human decision
              remain separate explicit actions.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
export function ConnectedResolution({
  detail,
  inspect,
  reinvestigate,
  busy,
}: {
  detail: CaseDetail;
  inspect: (id: string) => void;
  reinvestigate: () => void;
  busy: boolean;
}) {
  const rec = detail.currentRecommendation;
  const history = resolutionHistory(detail);
  return (
    <div className="resolution-shell">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            CASE {detail.caseCode} · PERSISTED RESOLUTION HISTORY
          </div>
          <h1>
            A clear outcome starts with why
            <span className="heading-dot">.</span>
          </h1>
          <p>
            Recommendation, human decision and simulated settlement remain
            distinct.
          </p>
        </div>
      </div>
      <Panel className="resolution-hero">
        <span className="resolution-symbol">
          <ShieldCheck size={35} />
        </span>
        <Badge tone={rec?.approvalState === "APPROVED" ? "green" : "amber"}>
          {rec ? humanize(rec.approvalState) : "No recommendation"}
        </Badge>
        <h2>{rec ? resolutionTitle(rec) : "Start with an investigation"}</h2>
        {rec && <p className="backend-code">Backend code: {rec.outcome}</p>}
        <p>
          {rec
            ? resolutionExplanation(rec)
            : "No backend recommendation has been issued yet."}
        </p>
        <div className="resolution-status">
          <ShieldCheck size={17} />
          {resolutionDecision(rec)}
        </div>
        {rec && !isSnapshotCurrent(detail) && (
          <p className="form-error">
            New evidence is not in this recommendation’s snapshot. Reinvestigate
            before review.
          </p>
        )}
      </Panel>
      <div className="resolution-grid">
        <Panel>
          <SectionTitle
            extra={
              <Badge>{detail.recommendationHistory.length} versions</Badge>
            }
          >
            Recommendation history
          </SectionTitle>
          <p className="quiet small">
            Earliest to latest · each assessment keeps its recorded outcome and
            evidence snapshot.
          </p>
          {detail.recommendationHistory.length ? (
            <ol className="resolution-records">
              {history.map(({ item, additions }, index) => (
                <li key={item.id}>
                  {additions.length > 0 && (
                    <div className="resolution-evidence-change">
                      <strong>
                        {additions.some((e) => e.type === "THIRD_PARTY_GEOTAG")
                          ? "Independent geotag added"
                          : "Evidence snapshot updated"}
                      </strong>
                      <p>
                        New evidence versions included in the assessment below.
                      </p>
                      {additions.map((entry) => (
                        <div key={entry.evidenceId}>
                          <EvidenceReferences
                            detail={detail}
                            ids={[entry.evidenceId]}
                            inspect={inspect}
                          />
                          {entry.submittedAt && (
                            <time>Submitted {dateTime(entry.submittedAt)}</time>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <article className="history-recommendation">
                    <span className="resolution-assessment">
                      {index === 0
                        ? "Initial assessment"
                        : `Assessment ${index + 1}`}{" "}
                      · {dateTime(item.createdAt)}
                    </span>
                    <div className="inline">
                      <Badge tone={item.id === rec?.id ? "pink" : "muted"}>
                        {item.id === rec?.id ? "Current" : "Superseded"}
                      </Badge>
                      <Badge
                        tone={
                          item.approvalState === "APPROVED" ? "green" : "muted"
                        }
                      >
                        {humanize(item.approvalState)}
                      </Badge>
                    </div>
                    <h3>{resolutionTitle(item)}</h3>
                    <p className="backend-code">Backend code: {item.outcome}</p>
                    <small>
                      {item.policyCode} v{item.policyVersion}
                    </small>
                    <p className="quiet small">
                      {item.sufficiencyState} · {item.evidenceSnapshot.length}{" "}
                      evidence groups
                    </p>
                    <EvidenceReferences
                      detail={detail}
                      ids={item.citations.map((c) =>
                        resolveCitationId(c.evidenceId, item),
                      )}
                      inspect={inspect}
                    />
                    <details>
                      <summary>
                        Original explanation, snapshot & policy citations
                      </summary>
                      <pre className="json-block">
                        {JSON.stringify(
                          {
                            outcome: item.outcome,
                            approvalState: item.approvalState,
                            rationale: item.rationale,
                            evidenceSnapshot: item.evidenceSnapshot,
                            citations: item.citations,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="No recommendations yet">
              Run the investigation from the workspace.
            </EmptyState>
          )}
        </Panel>
        <Panel>
          <SectionTitle>How we reached this decision</SectionTitle>
          <div className="reason-item">
            <span>01</span>
            <div>
              <h3>The agreed pickup</h3>
              <p>{detail.trip.pickup.label}</p>
            </div>
          </div>
          <div className="reason-item">
            <span>02</span>
            <div>
              <h3>The evidence actually evaluated</h3>
              <p>
                {rec
                  ? `${rec.evidenceSnapshot.length} groups in the recommendation snapshot; ${evidenceRows(detail).length} groups currently recorded.`
                  : "No evaluated snapshot yet."}
              </p>
            </div>
          </div>
          <div className="reason-item">
            <span>03</span>
            <div>
              <h3>Policy & human review</h3>
              <p>
                {rec
                  ? `${rec.policyCode} v${rec.policyVersion}. Approval state: ${rec.approvalState}.`
                  : "The backend checks sufficiency before applying policy."}
              </p>
            </div>
          </div>
          <Button variant="secondary" disabled={busy} onClick={reinvestigate}>
            Review in investigation workspace
            <ArrowUpRight size={15} />
          </Button>
        </Panel>
      </div>
      <div className="reopen-panel">
        <div>
          <h3>New evidence can change the picture.</h3>
          <p>
            There is no standalone reopen endpoint. Submit additional evidence
            and run a new investigation; the backend controls reopening and
            recommendation history.
          </p>
        </div>
        <Button variant="secondary" disabled>
          Standalone reopen unavailable
        </Button>
      </div>
      <PersistedAudit detail={detail} />
    </div>
  );
}
