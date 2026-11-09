import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Bootstrap 5 button styles, as used across AnkiWeb. */
const buttonStyles = {
  primary: "border-accent bg-accent text-accent-ink hover:border-accent-hover hover:bg-accent-hover",
  secondary: "border-accent bg-transparent text-accent hover:bg-accent hover:text-accent-ink",
  ghost: "border-transparent bg-transparent text-nav hover:text-ink",
};

type Variant = keyof typeof buttonStyles;

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-base font-normal leading-6 no-underline transition-colors disabled:pointer-events-none disabled:opacity-65";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-md border border-line bg-surface p-4", className)} {...props} />;
}

const badgeTones = {
  neutral: "bg-[#e9ecef] text-[#495057]",
  accent: "bg-[#cfe2ff] text-[#052c65]",
  good: "bg-good-soft text-[#0a3622]",
  warn: "bg-warn-soft text-[#664d03]",
  bad: "bg-bad-soft text-[#58151c]",
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, tone = "accent", label }: { value: number; tone?: "accent" | "good" | "warn"; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = { accent: "bg-accent", good: "bg-good", warn: "bg-[#ffc107]" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-md bg-grid" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx("h-full transition-all", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-sm text-muted">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-[2.25rem] leading-tight font-semibold">{title}</h1>
        {subtitle && <p className="mt-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Bootstrap "form-floating" input: the label sits inside the field and moves up when it has a value. */
export function Field({ label, error, className, ...props }: ComponentProps<"input"> & { label: string; error?: string }) {
  return (
    <div className={className}>
      <label className="relative block">
        <input
          placeholder=" "
          className={cx(
            "peer block h-[3.625rem] w-full rounded-md border bg-surface px-3 pt-6 pb-2 text-ink transition focus:outline-none focus:ring-4",
            error ? "border-bad focus:ring-bad/25" : "border-line focus:border-[#86b7fe] focus:ring-accent/25",
          )}
          {...props}
        />
        <span className="pointer-events-none absolute top-0 left-0 origin-top-left translate-x-3 translate-y-4 text-ink transition-transform peer-focus:translate-y-1.5 peer-focus:scale-85 peer-focus:text-muted peer-[:not(:placeholder-shown)]:translate-y-1.5 peer-[:not(:placeholder-shown)]:scale-85 peer-[:not(:placeholder-shown)]:text-muted">
          {label}
        </span>
      </label>
      {error && <span className="mt-1 block text-sm text-bad">{error}</span>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-grid", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="py-6">
      <p>{title}</p>
      {children && <div className="mt-1 text-muted">{children}</div>}
    </div>
  );
}

export { cx };
