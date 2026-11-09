import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-line bg-surface text-ink hover:bg-paper",
  ghost: "text-muted hover:text-ink hover:bg-surface",
};

type Variant = keyof typeof buttonStyles;

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-line bg-surface p-5", className)} {...props} />;
}

const badgeTones = {
  neutral: "bg-paper text-muted border border-line",
  accent: "bg-accent-soft text-accent",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, tone = "accent", label }: { value: number; tone?: "accent" | "good" | "warn"; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = { accent: "bg-accent", good: "bg-good", warn: "bg-warn" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx("h-full rounded-full transition-all", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, error, ...props }: ComponentProps<"input"> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        {...props}
      />
      {error && <span className="mt-1 block text-sm text-bad">{error}</span>}
    </label>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-line/60", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export { cx };
