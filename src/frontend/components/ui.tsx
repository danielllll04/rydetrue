import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowUpRight, LoaderCircle, X } from "lucide-react";
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "pink" | "green" | "amber" | "muted";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`}>{children}</section>;
}
export function SectionTitle({
  children,
  extra,
}: {
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {extra}
    </div>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <ArrowUpRight size={26} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Loading({ label = "Loading demo case…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={20} />
      {label}
    </div>
  );
}
export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-title">
          <h2>{title}</h2>
          <Button variant="ghost" aria-label="Close dialog" onClick={close}>
            <X size={20} />
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}
