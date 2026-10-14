"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  LayoutDashboard,
  Menu,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import type { SubmitEvidenceRequest } from "@/lib/schemas";
import { RT_001_STAGE_2_GEOTAG } from "@/lib/cases";
import type { CaseDetail, PolicyDto, ProviderMode } from "../lib/api-types";
import { apiClient, ApiError } from "../lib/api-client";
import { canReview, dateTime, evidenceRows } from "../lib/view-model";
import type { View } from "../lib/types";
import { Badge, Button, Dialog, EmptyState, Loading } from "./ui";
import { ConnectedInvestigation } from "./connected-investigation";
import {
  ConnectedOperations,
  ConnectedParty,
  ConnectedResolution,
} from "./connected-experiences";
const navigation = [
  {
    id: "operations",
    label: "Overview",
    icon: LayoutDashboard,
    group: "WORKSPACE",
  },
  {
    id: "investigation",
    label: "Investigation",
    icon: Scale,
    group: "WORKSPACE",
  },
  {
    id: "resolution",
    label: "Resolutions",
    icon: FileCheck2,
    group: "WORKSPACE",
  },
  {
    id: "rider",
    label: "Rider experience",
    icon: UserRound,
    group: "PARTY EXPERIENCES",
  },
  {
    id: "driver",
    label: "Driver experience",
    icon: ShieldCheck,
    group: "PARTY EXPERIENCES",
  },
] as const;
type Modal =
  | { kind: "help" | "account" | "geotag" | "notifications" }
  | { kind: "evidence"; id: string }
  | { kind: "review"; decision: "APPROVED" | "REJECTED"; recId: string };
export function ConnectedApp({ providerMode }: { providerMode: ProviderMode }) {
  const [view, setView] = useState<View>("investigation");
  const [selectedCode, setSelectedCode] = useState("RT-001");
  const [caseDetails, setCaseDetails] = useState<CaseDetail[]>([]);
  const [policies, setPolicies] = useState<PolicyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const hasModal = modal !== null;
  const [reviewer, setReviewer] = useState("reviewer:integration-demo");
  const [notes, setNotes] = useState("");
  const sidebar = useRef<HTMLElement>(null);
  const dialogs = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detail = caseDetails.find((c) => c.caseCode === selectedCode) || null;
  const activePolicy = policies.find(
    (p) =>
      p.code === "CANCELLATION_FEE_SG" &&
      new Date(p.effectiveFrom) <= new Date() &&
      (!p.effectiveTo || new Date(p.effectiveTo) > new Date()),
  );
  const refresh = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    const [summaries, nextPolicies] = await Promise.all([
      apiClient.listCases(),
      apiClient.listPolicies(),
    ]);
    // Next 14 may statically cache GET lists. Hydrate case detail (dynamic id
    // route) so displayed statuses/history always come from persisted records.
    const details = await Promise.all(
      summaries.map((c) => apiClient.getCase(c.caseCode)),
    );
    setCaseDetails(details);
    setPolicies(nextPolicies);
    if (initial) setLoading(false);
  }, []);
  useEffect(() => {
    const sync = () => {
      const [nextView, code] = window.location.hash.slice(1).split("/");
      if (navigation.some((n) => n.id === nextView)) setView(nextView as View);
      if (code) {
        try {
          setSelectedCode(decodeURIComponent(code));
        } catch {
          setError("The case code in this link is invalid.");
        }
      }
    };
    sync();
    void refresh(true).catch((e) => {
      setError((e as Error).message);
      setLoading(false);
    });
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh]);
  useEffect(() => {
    if (!hasModal && !mobileOpen) return;
    const target = hasModal ? dialogs.current : sidebar.current;
    const trigger = document.activeElement as HTMLElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    target?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setModal(null);
        setMobileOpen(false);
      }
      if (event.key !== "Tab") return;
      const nodes = target?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
      );
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [hasModal, mobileOpen, busy]);
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6500);
  }
  function navigate(next: View, code = selectedCode) {
    setView(next);
    setSelectedCode(code);
    window.location.hash = `${next}/${encodeURIComponent(code)}`;
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function mutate(
    operation: () => Promise<unknown>,
    message: string,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError("");
    let recorded = false;
    try {
      await operation();
      recorded = true;
      await refresh();
      setModal(null);
      notify(message);
      return true;
    } catch (e) {
      setError(
        `${recorded ? "The operation was recorded, but refreshing failed. Do not submit it again. " : ""}${(e as Error).message}`,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function runInvestigation() {
    if (!detail || !activePolicy) return;
    void mutate(async () => {
      const result = await apiClient.investigate(
        detail.caseCode,
        activePolicy.code,
      );
      if (result.status === "ESCALATED" || result.status === "PARTIAL")
        notify(
          `Investigation ${result.status.toLowerCase()}. Review the persisted audit and deterministic recommendation.`,
        );
    }, "Investigation response persisted. Review the evidence, policy and agent execution status.");
  }
  function evaluate() {
    if (detail && activePolicy)
      void mutate(
        () => apiClient.evaluate(detail.caseCode, activePolicy.code),
        "Deterministic evaluation persisted. No agents ran for this recommendation.",
      );
  }
  async function submitEvidence(body: SubmitEvidenceRequest) {
    return (
      !!detail &&
      mutate(
        () => apiClient.submitEvidence(detail.caseCode, body),
        "Evidence saved as a versioned backend record. Reinvestigate to include it.",
      )
    );
  }
  async function confirmReview(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || modal?.kind !== "review") return;
    const action = modal;
    await mutate(async () => {
      const fresh = await apiClient.getCase(detail.caseCode);
      if (fresh.currentRecommendation?.id !== action.recId || !canReview(fresh))
        throw new ApiError(
          409,
          "stale_recommendation",
          "The case or recommendation changed. Refresh and review the latest evidence before deciding.",
        );
      await apiClient.approve(detail.caseCode, action.recId, {
        decision: action.decision,
        actor: reviewer.trim(),
        notes: notes.trim(),
      });
    }, `Human ${action.decision.toLowerCase()} decision persisted. All monetary actions are simulated.`);
  }
  const close = () => {
    if (!busy) setModal(null);
  };
  const inspect = (id: string) => setModal({ kind: "evidence", id });
  const openReview = (decision: "APPROVED" | "REJECTED") => {
    if (!detail?.currentRecommendation) return;
    setNotes("");
    setModal({
      kind: "review",
      decision,
      recId: detail.currentRecommendation.id,
    });
  };
  const shownEvidence =
    modal?.kind === "evidence" && detail
      ? evidenceRows(detail).find((e) => e.id === modal.id)
      : null;
  const historicalEvidence =
    modal?.kind === "evidence"
      ? detail?.evidence.integrity.find((e) => e.id === modal.id)
      : null;
  const title = navigation.find((n) => n.id === view)?.label;
  return (
    <div className="app-shell connected-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        aria-hidden={!!modal || undefined}
      >
        <button
          className="drawer-close"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        >
          <X size={18} />
        </button>
        <div className="brand">
          <div
            className="brand-crop"
            role="img"
            aria-label="RydeTRUE approved logo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rydetrue-brand-original.png" alt="" />
          </div>
        </div>
        <div className="workspace-switch">
          <span className="workspace-symbol">
            <Scale size={18} />
          </span>
          <div>
            <strong>Ryde Operations</strong>
            <small>Connected local workspace</small>
          </div>
          <span className="demo-workspace-label">API</span>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map((item, index) => (
            <div key={item.id}>
              {(index === 0 || navigation[index - 1].group !== item.group) && (
                <div className="nav-group">{item.group}</div>
              )}
              <button
                disabled={busy}
                className={`nav-item ${view === item.id ? "active" : ""}`}
                onClick={() => navigate(item.id)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.id === "investigation" && (
                  <span className="nav-count">{caseDetails.length}</span>
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="fairness-card">
            <span>
              <ShieldCheck size={20} />
            </span>
            <strong>Fairness is a process.</strong>
            <p>
              Built on evidence.
              <br />
              Balanced by perspective.
            </p>
            <div>
              THE RYDETRUE PROMISE
              <ChevronRight size={13} />
            </div>
          </div>
          <button
            className="help-link"
            onClick={() => setModal({ kind: "help" })}
          >
            <CircleHelp size={17} />
            Help & integration guide
            <ChevronRight size={14} />
          </button>
          <button
            className="profile"
            onClick={() => setModal({ kind: "account" })}
          >
            <span className="profile-avatar">DR</span>
            <div>
              <strong>Demo reviewer</strong>
              <small>Claimed identity · unauthenticated</small>
            </div>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <div
        className="app-body"
        aria-hidden={!!modal || mobileOpen || undefined}
      >
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
            <ChevronRight size={13} />
            <span className="breadcrumb-case">{selectedCode}</span>
          </div>
          <div className="topbar-actions">
            <span className="demo-mode">
              <span />
              {providerMode === "mock"
                ? "Mock agents · connected API"
                : "Connected API"}
            </span>
            <button
              className="notification-button"
              aria-label="Notifications"
              onClick={() => setModal({ kind: "notifications" })}
            >
              <Bell size={19} />
            </button>
            <button
              className="top-avatar"
              aria-label="Reviewer account"
              onClick={() => setModal({ kind: "account" })}
            >
              DR
            </button>
          </div>
        </header>
        <main className="main-content" id="main-content">
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setError("");
                  try {
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Refresh data
              </Button>
            </div>
          )}
          {loading ? (
            <Loading label="Retrieving persisted cases and policies…" />
          ) : !caseDetails.length ? (
            <EmptyState title="No persisted cases available">
              The API did not return any cases. No demo fixtures are
              substituted.
            </EmptyState>
          ) : (
            <>
              <div className="case-selector">
                <label htmlFor="selected-case">Active case</label>
                <select
                  id="selected-case"
                  value={selectedCode}
                  disabled={busy}
                  onChange={(e) => navigate(view, e.target.value)}
                >
                  {!detail && (
                    <option value={selectedCode}>
                      {selectedCode} · unavailable
                    </option>
                  )}
                  {caseDetails.map((c) => (
                    <option value={c.caseCode} key={c.caseCode}>
                      {c.caseCode}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy}
                  onClick={async () => {
                    setError("");
                    try {
                      await refresh();
                      notify("Persisted case data refreshed.");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Refresh backend data
                </button>
                <span>Writes are persisted · no automatic approvals</span>
              </div>
              {view === "operations" ? (
                <ConnectedOperations
                  cases={caseDetails}
                  open={(code) => navigate("investigation", code)}
                />
              ) : !detail ? (
                <EmptyState title="Case not found in the workspace">
                  Select one of the cases returned by the backend.
                </EmptyState>
              ) : (
                <>
                  {!activePolicy && (
                    <div className="error-banner" role="alert">
                      No effective CANCELLATION_FEE_SG policy is available.
                      Investigation controls cannot run.
                    </div>
                  )}
                  {view === "investigation" && (
                    <ConnectedInvestigation
                      key={detail.caseCode}
                      detail={detail}
                      policies={policies}
                      mode={providerMode}
                      busy={busy || !activePolicy}
                      investigate={runInvestigation}
                      evaluate={evaluate}
                      addGeotag={() => setModal({ kind: "geotag" })}
                      inspect={inspect}
                      review={openReview}
                    />
                  )}
                  {(view === "rider" || view === "driver") && (
                    <ConnectedParty
                      key={`${view}-${detail.caseCode}`}
                      role={view === "rider" ? "RIDER" : "DRIVER"}
                      detail={detail}
                      busy={busy}
                      submitEvidence={submitEvidence}
                    />
                  )}
                  {view === "resolution" && (
                    <ConnectedResolution
                      detail={detail}
                      inspect={inspect}
                      busy={busy}
                      reinvestigate={() => navigate("investigation")}
                    />
                  )}
                </>
              )}
            </>
          )}
          <footer className="app-footer">
            <span>RydeTRUE © 2026</span>
            <span>Unofficial hackathon concept · synthetic records only</span>
            <span>
              Persisted evidence. Human decisions.
              <ShieldCheck size={12} />
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div ref={dialogs}>
        {modal?.kind === "help" && (
          <Dialog title="Connected demo walkthrough" close={close}>
            <ol className="demo-guide">
              <li>Open RT-001 and run the initial investigation.</li>
              <li>Read INSUFFICIENT_EVIDENCE and both persisted accounts.</li>
              <li>
                Preview and explicitly submit the synthetic THIRD_PARTY_GEOTAG.
              </li>
              <li>
                Run reinvestigation. Review REFUND_FULL for S$5.00 and the new
                evidence citations.
              </li>
              <li>
                Compare recommendation history; explicitly approve or reject as
                a claimed demo reviewer.
              </li>
            </ol>
            <div className="modal-note">
              This workspace uses actual local backend APIs and SQLite
              persistence. In mock mode, advisory agent outputs come from the
              existing deterministic mock provider. Real-provider tests have not
              been verified. All monetary actions are simulated.
            </div>
            <p>
              The existing backend home page remains at <a href="/">/</a>.
              Statement creation, file uploads and standalone reopening are not
              supported by the documented API.
            </p>
          </Dialog>
        )}
        {modal?.kind === "account" && (
          <Dialog title="Unauthenticated demo reviewer" close={close}>
            <p>
              The backend trusts the submitted actor string. This workspace has
              no authentication, roles or verified reviewer identity. Approval
              is a persisted simulated action.
            </p>
            <Badge tone="amber">Local synthetic demonstration only</Badge>
          </Dialog>
        )}
        {modal?.kind === "notifications" && (
          <Dialog title="Case activity" close={close}>
            {detail?.audit
              .slice(-3)
              .reverse()
              .map((a) => (
                <div
                  className="notification-record connected-notification"
                  key={a.id}
                >
                  <span className="case-icon">
                    <Sparkles size={20} />
                  </span>
                  <div>
                    <strong>{a.action}</strong>
                    <p>
                      {a.actor} · {dateTime(a.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            <p>
              No notification endpoint exists. These entries are the latest
              persisted case audit events.
            </p>
          </Dialog>
        )}
        {modal?.kind === "evidence" && (
          <Dialog
            title={
              modal.id === "policy"
                ? "Policy citations"
                : "Persisted evidence record"
            }
            close={close}
          >
            {modal.id === "policy" ? (
              <pre className="json-block">
                {JSON.stringify(
                  {
                    recommendation: detail?.currentRecommendation?.policyCode,
                    version: detail?.currentRecommendation?.policyVersion,
                    citations: detail?.currentRecommendation?.citations.filter(
                      (c) => c.ruleId,
                    ),
                    policies,
                  },
                  null,
                  2,
                )}
              </pre>
            ) : modal.id === "trip" ? (
              <>
                <p>
                  This backend citation refers to the trip record, rather than
                  an evidence upload.
                </p>
                <pre className="json-block">
                  {JSON.stringify(detail?.trip, null, 2)}
                </pre>
              </>
            ) : shownEvidence ? (
              <>
                <Badge tone={shownEvidence.hashMatches ? "green" : "amber"}>
                  {shownEvidence.hashMatches
                    ? "Hash verified by backend"
                    : "Integrity issue"}
                </Badge>
                <h3 className="modal-title">
                  {shownEvidence.refGroup} · v{shownEvidence.latestVersion}
                </h3>
                <p>
                  {shownEvidence.type} · {shownEvidence.source}
                  <br />
                  {dateTime(shownEvidence.latestCapturedAt)}
                </p>
                <div className="modal-note">
                  ID: {shownEvidence.id}
                  <br />
                  Hash:{" "}
                  <span className="hash-value">{shownEvidence.latestHash}</span>
                  <br />
                  Preserved versions: {shownEvidence.historyVersions.join(", ")}
                </div>
                <pre className="json-block">
                  {JSON.stringify(shownEvidence.payload, null, 2)}
                </pre>
              </>
            ) : (
              <>
                <p>
                  Evidence ID: <span className="hash-value">{modal.id}</span>
                </p>
                {historicalEvidence ? (
                  <>
                    <Badge>
                      Historical version {historicalEvidence.version}
                    </Badge>
                    <p>
                      Group: {historicalEvidence.refGroup}. Integrity:{" "}
                      {historicalEvidence.hashMatches ? "verified" : "failed"}.
                    </p>
                    <p>
                      The API returns payloads for latest versions only. This
                      historical payload cannot be previewed here; no newer
                      payload is substituted.
                    </p>
                  </>
                ) : (
                  <p>
                    This citation is not a current evidence record. Review the
                    raw recommendation snapshot and policy citation.
                  </p>
                )}
              </>
            )}
          </Dialog>
        )}
        {modal?.kind === "geotag" && detail && (
          <Dialog title="Submit new synthetic geotag" close={close}>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <p>
              Preview of the existing backend RT-001 Stage 2 fixture. This
              fictional airport record identifies the designated entrance and
              driver’s actual waiting coordinates. It is not evidence from a
              real airport service.
            </p>
            <Badge tone="pink">THIRD_PARTY_GEOTAG · THIRD_PARTY</Badge>
            <pre className="json-block">
              {JSON.stringify(RT_001_STAGE_2_GEOTAG, null, 2)}
            </pre>
            <div className="modal-note">
              Saving creates a versioned backend evidence record. Investigation
              is a separate explicit action. No real file is uploaded.
            </div>
            <Button
              disabled={
                busy ||
                detail.caseCode !== "RT-001" ||
                detail.evidence.groups.some(
                  (g) => g.type === "THIRD_PARTY_GEOTAG",
                )
              }
              onClick={() =>
                void submitEvidence({
                  ...RT_001_STAGE_2_GEOTAG,
                  actor: "reviewer:integration-demo",
                  notes:
                    "Synthetic Stage 2 fixture explicitly submitted in the connected workspace.",
                })
              }
            >
              {busy ? "Submitting…" : "Submit geotag evidence"}
              <ArrowRightIcon />
            </Button>
          </Dialog>
        )}
        {modal?.kind === "review" && detail && (
          <Dialog
            title={
              modal.decision === "APPROVED"
                ? "Confirm human approval"
                : "Confirm human rejection"
            }
            close={close}
          >
            <form onSubmit={confirmReview}>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Badge tone="amber">
                Explicit human decision · simulated monetary action
              </Badge>
              <h3 className="modal-title">
                {detail.currentRecommendation?.outcome} · S$
                {(
                  (detail.currentRecommendation?.refundCents || 0) / 100
                ).toFixed(2)}
              </h3>
              <p>
                Recommendation <span className="hash-value">{modal.recId}</span>
                . The case and evidence will be re-read before the decision is
                submitted.
              </p>
              <label className="field-label" htmlFor="reviewer-id">
                Claimed reviewer identity
              </label>
              <input
                id="reviewer-id"
                className="review-input"
                required
                minLength={1}
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                disabled={busy}
              />
              <label className="field-label" htmlFor="review-reason">
                Reason for this decision
              </label>
              <textarea
                id="review-reason"
                required
                minLength={10}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
              />
              <p className="quiet small">
                At least 10 characters. This identity is not authenticated by
                the backend.
              </p>
              <div className="review-confirm">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={close}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !notes.trim() || !reviewer.trim()}
                >
                  {busy
                    ? "Recording decision…"
                    : modal.decision === "APPROVED"
                      ? "Confirm simulated approval"
                      : "Confirm rejection"}
                </Button>
              </div>
            </form>
          </Dialog>
        )}
      </div>
    </div>
  );
}
function ArrowRightIcon() {
  return <ChevronRight size={15} />;
}
