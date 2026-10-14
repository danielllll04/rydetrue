"use client";
import { useEffect, useRef, useState } from "react";
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
import type {
  AuditEvent,
  Decision,
  DemoCase,
  Evidence,
  Investigation,
  Stage,
  Submission,
  View,
} from "@/frontend/lib/types";
import { caseService, createDemoService } from "@/frontend/lib/service";
import { Badge, Button, Dialog, Loading } from "./ui";
import { InvestigationWorkspace } from "./investigation";
import {
  Operations,
  ResolutionExperience,
  SubmissionExperience,
} from "./experiences";
const navigation: {
  id: View;
  label: string;
  icon: typeof Scale;
  group: string;
}[] = [
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
    group: "DEMO EXPERIENCES",
  },
  {
    id: "driver",
    label: "Driver experience",
    icon: ShieldCheck,
    group: "DEMO EXPERIENCES",
  },
];
const titles: Record<View, string> = {
  investigation: "Investigation",
  operations: "Overview",
  resolution: "Resolution",
  rider: "Rider experience",
  driver: "Driver experience",
};
export function RydeApp() {
  const [view, setView] = useState<View>("investigation");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [data, setData] = useState<Investigation | null>(null);
  const [cases, setCases] = useState<DemoCase[]>([]);
  const [decision, setDecision] = useState<Decision>("pending");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<
    "help" | "notifications" | "account" | null
  >(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(
    null,
  );
  const [selectedCase, setSelectedCase] = useState<DemoCase | null>(null);
  const [submissions, setSubmissions] = useState<
    Record<"rider" | "driver", Submission | null>
  >({ rider: null, driver: null });
  const [audit, setAudit] = useState<AuditEvent[]>([
    {
      id: "initial",
      time: "12 Oct · 14:40 SGT",
      title: "Initial investigation recorded",
      detail:
        "E-001–E-003 evaluated. Entrance remains unverified; recommendation held.",
    },
  ]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const anyModal = !!modal || !!selectedEvidence || !!selectedCase;
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5500);
  }
  function log(title: string, detail: string) {
    setAudit((a) => [
      ...a,
      {
        id: `${Date.now()}-${a.length}`,
        time: `${new Intl.DateTimeFormat("en-SG", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Singapore" }).format(new Date())} SGT · session`,
        title,
        detail,
      },
    ]);
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [list, investigation] = await Promise.all([
        caseService.listCases(),
        caseService.getInvestigation("initial"),
      ]);
      setCases(list);
      setData(investigation);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const sync = () => {
      const hash = window.location.hash.slice(1);
      if (navigation.some((n) => n.id === hash)) setView(hash as View);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!mobileOpen || anyModal) return;
    const trigger = document.activeElement as HTMLElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
      if (event.key !== "Tab") return;
      const buttons =
        sidebarRef.current?.querySelectorAll<HTMLElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
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
      trigger.focus();
    };
  }, [mobileOpen, anyModal]);
  useEffect(() => {
    if (!anyModal) return;
    lastFocus.current = document.activeElement as HTMLElement;
    modalRef.current?.querySelector<HTMLElement>("button")?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setSelectedEvidence(null);
        setSelectedCase(null);
      }
      if (e.key !== "Tab") return;
      const nodes = modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]',
      );
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      lastFocus.current?.focus();
    };
  }, [anyModal]);
  function navigate(next: View) {
    setView(next);
    window.location.hash = next;
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function changeStage(stage: Stage) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await caseService.getInvestigation(stage);
      setData(next);
      setDecision("pending");
      setCases((c) =>
        c.map((item) =>
          item.id === "RT-001" ? { ...item, status: "Needs review" } : item,
        ),
      );
      log(
        stage === "initial"
          ? "Initial evidence reopened"
          : "Reinvestigation fixture loaded",
        stage === "initial"
          ? "Returned to E-001–E-003. A new human decision is required."
          : "E-004 identifies Door 8. Fictional policy §2.2 supports a refund recommendation.",
      );
      notify(
        stage === "initial"
          ? "Initial demo findings restored."
          : "Updated demo findings loaded. No live AI execution.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function review(next: "approved" | "escalated") {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await caseService.review(next, data.stage);
      setDecision(result.decision);
      setCases((c) =>
        c.map((item) =>
          item.id === "RT-001"
            ? {
                ...item,
                status: next === "approved" ? "Resolved" : "Escalated",
                updated: "Just now",
              }
            : item,
        ),
      );
      log(
        next === "approved"
          ? "Recommendation approved by demo reviewer"
          : "Escalated to human review",
        next === "approved"
          ? "S$5.00 refund recommendation approved in memory. No financial action taken."
          : "Added to the demo human review queue for an operations decision.",
      );
      notify(
        next === "approved"
          ? "Demo approval recorded. No refund was issued."
          : "Added to the demo human review queue.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(role: "rider" | "driver", submission: Submission) {
    setBusy(true);
    setError("");
    try {
      await caseService.submit(role, submission);
      setSubmissions((s) => ({ ...s, [role]: submission }));
      log(
        `${role === "rider" ? "Rider dispute" : "Driver response"} saved`,
        "Statement and file names stored for this session only. Fixture findings remain unchanged.",
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
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
        ref={sidebarRef}
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        aria-hidden={anyModal || undefined}
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
            {/* Supplied asset stays byte-for-byte unchanged; this viewport displays its primary lockup. */}
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
            <small>Dispute resolution</small>
          </div>
          <span className="demo-workspace-label">DEMO</span>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map((item, index) => (
            <div key={item.id}>
              {(index === 0 || navigation[index - 1].group !== item.group) && (
                <div className="nav-group">{item.group}</div>
              )}
              <button
                className={`nav-item ${view === item.id ? "active" : ""}`}
                onClick={() => navigate(item.id)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.id === "investigation" && (
                  <span className="nav-count">1</span>
                )}
                {view === item.id && item.id !== "investigation" && (
                  <ChevronRight size={14} />
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
              <ArrowUpIcon />
            </div>
          </div>
          <button className="help-link" onClick={() => setModal("help")}>
            <CircleHelp size={17} />
            Help & demo guide
            <ChevronRight size={14} />
          </button>
          <button className="profile" onClick={() => setModal("account")}>
            <span className="profile-avatar">AL</span>
            <div>
              <strong>Alex Lee</strong>
              <small>Operations reviewer · Demo</small>
            </div>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <div
        className="app-body"
        aria-hidden={anyModal || mobileOpen || undefined}
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
            <strong>{titles[view]}</strong>
            {view === "investigation" && (
              <>
                <ChevronRight size={13} />
                <span className="breadcrumb-case">RT-001</span>
              </>
            )}
          </div>
          <div className="topbar-actions">
            <span className="demo-mode">
              <span />
              Demo mode
            </span>
            <button
              aria-label="Notifications"
              className="notification-button"
              onClick={() => setModal("notifications")}
            >
              <Bell size={19} />
              <i />
            </button>
            <button
              className="top-avatar"
              aria-label="Reviewer account"
              onClick={() => setModal("account")}
            >
              AL
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <Button
                variant="secondary"
                onClick={() => {
                  if (!data) void load();
                  else {
                    setError("");
                    notify("Demo service restored. Retry your last action.");
                  }
                }}
              >
                Retry
              </Button>
            </div>
          )}
          {loading ? (
            <Loading />
          ) : !data ? (
            <div className="empty-state">
              <h1>Case unavailable</h1>
              <p>Retry loading the synthetic demo above.</p>
            </div>
          ) : (
            <>
              {view === "investigation" && (
                <InvestigationWorkspace
                  data={data}
                  decision={decision}
                  busy={busy}
                  audit={audit}
                  changeStage={changeStage}
                  review={review}
                  navigate={() => navigate("resolution")}
                  showEvidence={setSelectedEvidence}
                />
              )}
              {view === "operations" && (
                <Operations
                  cases={cases}
                  navigate={navigate}
                  inspect={setSelectedCase}
                />
              )}
              {(view === "rider" || view === "driver") && (
                <SubmissionExperience
                  key={view}
                  role={view}
                  submit={submit}
                  busy={busy}
                  navigate={navigate}
                  saved={submissions[view]}
                />
              )}
              {view === "resolution" && (
                <ResolutionExperience
                  data={data}
                  decision={decision}
                  audit={audit}
                  navigate={navigate}
                  busy={busy}
                  reopen={() => {
                    void changeStage("initial");
                    navigate("investigation");
                  }}
                />
              )}
            </>
          )}
          <footer className="app-footer">
            <span>
              RydeTRUE <span>©</span> 2026
            </span>
            <span>
              Unofficial hackathon concept · Tencent Cloud AI CAN DO IT
            </span>
            <span>
              Designed for a fairer journey
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
      <div ref={modalRef}>
        {selectedEvidence && (
          <Dialog
            title={`${selectedEvidence.id} · Evidence record`}
            close={() => setSelectedEvidence(null)}
          >
            <Badge tone={selectedEvidence.kind === "new" ? "pink" : "muted"}>
              {selectedEvidence.source}
            </Badge>
            <h3 className="modal-title">{selectedEvidence.title}</h3>
            <p>{selectedEvidence.detail}</p>
            <div className="modal-note">
              Synthetic record · 12 Oct 2026, {selectedEvidence.time} SGT
              <br />
              References are illustrative. No original personal data is present.
            </div>
          </Dialog>
        )}
        {selectedCase && (
          <Dialog
            title={`${selectedCase.id} · Synthetic case`}
            close={() => setSelectedCase(null)}
          >
            <Badge>{selectedCase.status}</Badge>
            <h3 className="modal-title">{selectedCase.route}</h3>
            <p>
              {selectedCase.category} · S${selectedCase.amount.toFixed(2)}
            </p>
            <p>
              This overview fixture has no investigation records. RT-001 is the
              complete demonstration case.
            </p>
            <Button
              onClick={() => {
                setSelectedCase(null);
                navigate("investigation");
              }}
            >
              Open RT-001
              <ChevronRight size={15} />
            </Button>
          </Dialog>
        )}
        {modal === "help" && (
          <Dialog
            title="A quick guide to the demo"
            close={() => setModal(null)}
          >
            <p>
              RydeTRUE is an unofficial hackathon concept. All cases,
              statements, policies, scores and agent findings are synthetic.
            </p>
            <ol className="demo-guide">
              <li>Open the initial investigation and inspect E-001–E-003.</li>
              <li>Load the reinvestigation fixture to include E-004.</li>
              <li>
                Compare the entrance evidence and changed fictional policy
                finding.
              </li>
              <li>
                Approve or escalate as the demo reviewer, then view the
                resolution.
              </li>
            </ol>
            <div className="modal-note">
              No live agents run. No files are uploaded, no messages are sent
              and no money is moved. State is held in memory and resets on
              reload.
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                setModal(null);
                try {
                  await createDemoService(300, true).listCases();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Preview service error state
            </Button>
          </Dialog>
        )}
        {modal === "notifications" && (
          <Dialog title="Demo notifications" close={() => setModal(null)}>
            <div className="notification-record">
              <span className="case-icon">
                <Sparkles size={20} />
              </span>
              <div>
                <strong>New evidence for RT-001</strong>
                <p>
                  E-004 adds pickup entrance context. Open the case to compare
                  both findings.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setModal(null);
                    navigate("investigation");
                  }}
                >
                  Open case
                  <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          </Dialog>
        )}
        {modal === "account" && (
          <Dialog title="Demo reviewer" close={() => setModal(null)}>
            <div className="reviewer-details">
              <span className="profile-avatar">AL</span>
              <div>
                <strong>Alex Lee</strong>
                <p>Operations reviewer · synthetic identity</p>
              </div>
            </div>
            <p>
              This demonstration has no sign-in or authentication. Approval
              actions record a local reviewer event only.
            </p>
            <Badge tone="pink">Session-only workspace</Badge>
          </Dialog>
        )}
      </div>
    </div>
  );
}
function ArrowUpIcon() {
  return <ChevronRight size={13} />;
}
