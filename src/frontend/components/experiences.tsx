"use client";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  MapPin,
  Search,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import type {
  AuditEvent,
  Decision,
  DemoCase,
  Investigation,
  Submission,
  View,
} from "@/frontend/lib/types";
import { Badge, Button, EmptyState, Panel, SectionTitle } from "./ui";
import { validateSubmission } from "@/frontend/lib/service";
export function Operations({
  cases,
  navigate,
  inspect,
}: {
  cases: DemoCase[];
  navigate: (view: View) => void;
  inspect: (item: DemoCase) => void;
}) {
  const [status, setStatus] = useState("All cases");
  const [category, setCategory] = useState("All categories");
  const [search, setSearch] = useState("");
  const [high, setHigh] = useState(false);
  const filtered = cases.filter(
    (c) =>
      (status === "All cases" || c.status === status) &&
      (category === "All categories" || c.category === category) &&
      (!high || c.priority === "High") &&
      `${c.id} ${c.route}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">RYDE OPERATIONS</div>
          <h1>
            A little clarity. A fairer ride
            <span className="heading-dot">.</span>
          </h1>
          <p>Your overview of the cases that need a human touch.</p>
        </div>
        <Badge tone="pink">Synthetic cases</Badge>
      </div>
      <div className="metrics">
        {[
          {
            label: "Total cases",
            value: cases.length,
            detail: "Across the demo workspace",
          },
          {
            label: "Needs human review",
            value: cases.filter(
              (c) => c.status === "Needs review" || c.status === "Escalated",
            ).length,
            detail: "Ready for your perspective",
          },
          {
            label: "In progress",
            value: cases.filter((c) =>
              ["Investigating", "Awaiting response"].includes(c.status),
            ).length,
            detail: "Evidence is coming together",
          },
          {
            label: "Resolved",
            value: cases.filter((c) => c.status === "Resolved").length,
            detail: "A fairer way forward",
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
      <div className="review-callout">
        <span className="case-icon">
          <ShieldCheck size={25} />
        </span>
        <div>
          <h2>One case. Two perspectives. Your judgment.</h2>
          <p>RT-001 has new entrance-level evidence to review.</p>
        </div>
        <Button onClick={() => navigate("investigation")}>
          Open investigation
          <ArrowRight size={16} />
        </Button>
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
            {[
              "All cases",
              "Needs review",
              "Investigating",
              "Awaiting response",
              "Resolved",
              "Escalated",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Filter category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {["All categories", "Cancellation fee", "Fare adjustment"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
          <button
            className={`button secondary ${high ? "selected-filter" : ""}`}
            aria-pressed={high}
            onClick={() => setHigh(!high)}
          >
            <Filter size={14} />
            High priority
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Case / Trip</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Updated</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      className="case-link"
                      onClick={() =>
                        item.id === "RT-001"
                          ? navigate("investigation")
                          : inspect(item)
                      }
                    >
                      {item.id}
                      <ArrowUpRight size={12} />
                    </button>
                    <p>{item.route}</p>
                  </td>
                  <td>{item.category}</td>
                  <td>
                    <strong>S${item.amount.toFixed(2)}</strong>
                  </td>
                  <td>
                    <Badge
                      tone={
                        item.status === "Resolved"
                          ? "green"
                          : item.status === "Needs review" ||
                              item.status === "Escalated"
                            ? "amber"
                            : "muted"
                      }
                    >
                      {item.status}
                    </Badge>
                  </td>
                  <td>
                    <span className={`priority ${item.priority.toLowerCase()}`}>
                      <span />
                      {item.priority}
                    </span>
                  </td>
                  <td className="quiet">{item.updated}</td>
                  <td>
                    <Button
                      variant="ghost"
                      aria-label={`Open ${item.id}`}
                      onClick={() =>
                        item.id === "RT-001"
                          ? navigate("investigation")
                          : inspect(item)
                      }
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState title="No cases match these filters">
            Try a different category, status, or search.
          </EmptyState>
        )}
      </Panel>
      <p className="quiet small">
        All four cases are synthetic. RT-001 includes the complete interactive
        investigation.
      </p>
    </>
  );
}
export function TripSummary() {
  return (
    <div className="trip-summary">
      <div className="trip-top">
        <span>
          <MapPin size={17} />
          YOUR TRIP
        </span>
        <strong>
          S$5.00<span> cancellation fee</span>
        </strong>
      </div>
      <div className="trip-route">
        <div>
          <i />
          <span>
            Changi Airport T3 · Door 6<small>Designated pickup</small>
          </span>
        </div>
        <div>
          <i />
          <span>
            Tampines Central<small>Destination</small>
          </span>
        </div>
      </div>
      <div className="trip-meta">
        12 Oct 2026, 14:32 SGT<span>RYD-88421</span>
      </div>
    </div>
  );
}
export function SubmissionExperience({
  role,
  submit,
  busy,
  navigate,
  saved,
}: {
  role: "rider" | "driver";
  submit: (
    role: "rider" | "driver",
    submission: Submission,
  ) => Promise<boolean>;
  busy: boolean;
  navigate: (view: View) => void;
  saved: Submission | null;
}) {
  const driver = role === "driver";
  const [statement, setStatement] = useState("");
  const [category, setCategory] = useState("Cancellation fee");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const submission = {
      category,
      statement,
      files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
    };
    const issue = validateSubmission(submission);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    await submit(role, submission);
  }
  if (saved)
    return (
      <div className="consumer-shell">
        <div className="confirmation">
          <span className="confirmation-icon">
            <CheckCircle2 size={38} />
          </span>
          <Badge tone="green">Demo submission saved</Badge>
          <h1>
            {driver
              ? "Your side is part of the picture."
              : "We’re here to hear both sides."}
          </h1>
          <p>
            {driver
              ? "Your response has been recorded in this demo session."
              : "Your dispute is ready for review in this demo session."}{" "}
            Your reference is <strong>RT-001</strong>.
          </p>
          <Panel>
            <SectionTitle>Case tracking</SectionTitle>
            {[
              "Dispute raised",
              driver ? "Driver response received" : "Awaiting driver response",
              "Evidence review",
              "Human decision",
            ].map((step, i) => (
              <div className="tracking-step" key={step}>
                <span className={i < (driver ? 2 : 1) ? "done" : ""}>
                  {i < (driver ? 2 : 1) ? <Check size={13} /> : i + 1}
                </span>
                {step}
                <Badge>{i < (driver ? 2 : 1) ? "Complete" : "Pending"}</Badge>
              </div>
            ))}
            <p className="quiet small">
              Submission does not alter the prewritten RT-001 findings.
            </p>
          </Panel>
          <Button onClick={() => navigate("investigation")}>
            Track the investigation
            <ArrowRight size={16} />
          </Button>
          <p className="quiet small">
            No files were uploaded. Demo records reset when the page reloads.
          </p>
        </div>
      </div>
    );
  return (
    <div className="consumer-shell">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {driver
              ? "YOUR PERSPECTIVE MATTERS"
              : "LET’S FIND A FAIR RESOLUTION"}
          </div>
          <h1>
            {driver ? "Tell us your side." : "Something didn’t feel right?"}
          </h1>
          <p>
            {driver
              ? "Help us understand the trip from your perspective."
              : "Share what happened. We’ll look at the evidence together."}
          </p>
        </div>
      </div>
      {driver && (
        <div className="driver-notice">
          <ShieldCheck size={20} />
          <div>
            <strong>A rider has raised a cancellation fee dispute.</strong>
            <p>
              Demo notification · RT-001 · Your response will be considered
              alongside the rider’s account.
            </p>
          </div>
        </div>
      )}
      <div className="submission-grid">
        <form className="panel submission-form" onSubmit={onSubmit}>
          <SectionTitle>
            {driver ? "Your response" : "Raise a dispute"}
          </SectionTitle>
          {driver && (
            <blockquote>
              <span>RIDER’S ALLEGATION</span>“I waited at Door 6. The driver
              never arrived at the designated pickup entrance, but I was charged
              S$5.”
            </blockquote>
          )}
          <label className="field-label" htmlFor={`${role}-category`}>
            Dispute category
          </label>
          <select
            id={`${role}-category`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              "Cancellation fee",
              "Fare adjustment",
              "Pickup issue",
              "Other",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="field-label" htmlFor={`${role}-statement`}>
            {driver ? "What happened on your trip?" : "Tell us what happened"}
          </label>
          <textarea
            id={`${role}-statement`}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            maxLength={3000}
            rows={6}
            required
            placeholder={
              driver
                ? "Where did you wait? Which pickup entrance did you use?"
                : "Where were you waiting? What happened before the cancellation?"
            }
          />
          <div className="textarea-help">
            <span>
              At least 20 characters. Please leave out personal contact details.
            </span>
            <span>{statement.length}/3,000</span>
          </div>
          <label className="field-label" htmlFor={`${role}-files`}>
            Supporting evidence <span className="quiet">(optional)</span>
          </label>
          <label className="upload-area" htmlFor={`${role}-files`}>
            <UploadCloud size={25} />
            <strong>Choose evidence files</strong>
            <span>JPG, PNG or PDF · up to 10 MB each · 5 files max</span>
            <span className="upload-demo">
              Demo only · files stay on your device
            </span>
          </label>
          <input
            className="file-input"
            id={`${role}-files`}
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            multiple
            onChange={(e) => {
              const selected = [...files, ...Array.from(e.target.files || [])];
              const issue = validateSubmission({
                statement: "Temporary validation statement.",
                category,
                files: selected.map((f) => ({
                  name: f.name,
                  size: f.size,
                  type: f.type,
                })),
              });
              if (issue) setError(issue);
              else {
                setFiles(selected);
                setError("");
              }
              e.target.value = "";
            }}
          />
          {files.map((f, i) => (
            <div className="file-row" key={`${f.name}-${i}`}>
              <FileText size={15} />
              <span>{f.name}</span>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove ${f.name}`}
                onClick={() =>
                  setFiles(files.filter((_, index) => i !== index))
                }
              >
                <X size={14} />
              </Button>
            </div>
          ))}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="submit-footer">
            <span>
              <ShieldCheck size={14} />
              Reviewed with care and context
            </span>
            <Button type="submit" disabled={busy}>
              {busy
                ? "Saving demo…"
                : driver
                  ? "Submit demo response"
                  : "Submit demo dispute"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
        <aside>
          <TripSummary />
          <Panel className="what-next">
            <SectionTitle>What happens next?</SectionTitle>
            {[
              "Both sides share their account",
              "Evidence is reviewed together",
              "A human approves the outcome",
            ].map((text, i) => (
              <div key={text}>
                <span>{i + 1}</span>
                <p>{text}</p>
              </div>
            ))}
            <p className="quiet small">
              An unofficial hackathon concept. No real dispute is submitted and
              no fee is charged.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
export function ResolutionExperience({
  data,
  decision,
  audit,
  navigate,
  reopen,
  busy,
}: {
  data: Investigation;
  decision: Decision;
  audit: AuditEvent[];
  navigate: (view: View) => void;
  reopen: () => void;
  busy: boolean;
}) {
  const approved = decision === "approved";
  return (
    <div className="resolution-shell">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CASE RT-001 · RESOLUTION</div>
          <h1>
            A clear outcome starts with why
            <span className="heading-dot">.</span>
          </h1>
          <p>The evidence, the policy, and the person behind the decision.</p>
        </div>
      </div>
      <Panel className="resolution-hero">
        <span className="resolution-symbol">
          <ScaleIcon approved={approved} />
        </span>
        <Badge tone={approved ? "green" : "amber"}>
          {approved
            ? "Approved in demo"
            : decision === "escalated"
              ? "Escalated for human review"
              : "Awaiting human review"}
        </Badge>
        <h2>{data.recommendation}</h2>
        <p>{data.explanation}</p>
        <div className="resolution-status">
          <ShieldCheck size={17} />
          {approved
            ? "Human approval recorded. No money has been moved."
            : "An operations reviewer must decide before any refund can be issued."}
        </div>
      </Panel>
      <div className="resolution-grid">
        <Panel>
          <SectionTitle>Why this recommendation?</SectionTitle>
          <div className="reason-item">
            <span>01</span>
            <div>
              <h3>The agreed pickup</h3>
              <p>
                E-001 identifies Terminal 3, Door 6 as the designated entrance.
              </p>
            </div>
          </div>
          <div className="reason-item">
            <span>02</span>
            <div>
              <h3>
                {data.stage === "initial" ? "The evidence gap" : "What changed"}
              </h3>
              <p>
                {data.stage === "initial"
                  ? "E-002 places the driver near the terminal, but not at a specific entrance."
                  : "E-004 identifies Door 8. This explains why both parties reported waiting but could not find each other."}
              </p>
            </div>
          </div>
          <div className="reason-item">
            <span>03</span>
            <div>
              <h3>The fictional policy</h3>
              <p>
                {data.policy}.{" "}
                {data.stage === "initial"
                  ? "Responsibility remains unverified."
                  : "Arrival at a different entrance does not satisfy the arrival condition."}
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => navigate("investigation")}>
            Review all referenced evidence
            <ArrowUpRight size={15} />
          </Button>
        </Panel>
        <Panel>
          <SectionTitle>Resolution history</SectionTitle>
          <div className="resolution-history">
            {audit.map((e) => (
              <div key={e.id}>
                <Clock3 size={15} />
                <div>
                  <strong>{e.title}</strong>
                  <p>{e.detail}</p>
                  <time>{e.time}</time>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="reopen-panel">
        <div>
          <h3>There’s always room for new evidence.</h3>
          <p>
            Reopen the demo case to review the initial evidence again. Previous
            decisions stay in the session history.
          </p>
        </div>
        <Button variant="secondary" disabled={busy} onClick={reopen}>
          Reopen demo case
          <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}
function ScaleIcon({ approved }: { approved: boolean }) {
  return approved ? <CheckCircle2 size={35} /> : <ShieldCheck size={35} />;
}
