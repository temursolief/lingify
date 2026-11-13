import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Warfront buttons: the primary action is a solid signal-red block with a darker pressed edge along the bottom (it
 * sinks when pressed), the secondary a cream block edged in tan, the ghost a bare red word.
 */
const buttonStyles = {
  primary:
    "bg-accent text-white shadow-[inset_0_-3px_0_var(--accent-shade)] hover:bg-accent-hover hover:text-white active:translate-y-px active:shadow-[inset_0_-1px_0_var(--accent-shade)]",
  secondary:
    "border border-line bg-surface text-ink shadow-[inset_0_-2px_0_var(--line)] hover:bg-[color-mix(in_srgb,var(--surface)_80%,var(--line))] hover:text-ink active:translate-y-px active:shadow-none",
  ghost: "bg-transparent text-accent-ink hover:bg-accent-soft hover:text-accent-ink",
};

type Variant = keyof typeof buttonStyles;

const buttonBase =
  "caps inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-[15px] leading-5 no-underline hover:no-underline transition-colors disabled:pointer-events-none disabled:opacity-45";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

/** A cream panel edged in tan on the paper ground. `lift`: a soft warm shadow for panels that stand apart. */
export function Card({ className, lift, ...props }: ComponentProps<"div"> & { lift?: boolean }) {
  return <div className={cx("rounded-xl border border-line bg-surface p-4", lift && "shadow-lifted", className)} {...props} />;
}

/** Small condensed tags tinted from the ramps: a faint fill with strong text. */
const badgeTones = {
  neutral: "bg-[var(--color-neutral-800)] text-[var(--color-neutral-200)]",
  accent: "bg-[var(--color-accent-800)] text-[var(--color-accent-100)]",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export type Tone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("caps inline-flex items-center rounded-[4px] px-2 py-0.5 text-[11px] tracking-[0.08em] whitespace-nowrap", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, tone = "accent", label, className }: { value: number; tone?: "accent" | "good" | "warn"; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = { accent: "bg-accent", good: "bg-good", warn: "bg-warn" }[tone];
  return (
    <div
      className={cx("h-1.5 w-full overflow-hidden rounded-[2px] bg-grid", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cx("h-full rounded-[2px] transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1 rounded-lg border border-line bg-surface p-3.5", className)}>
      <div className="caps text-[11px] text-muted">{label}</div>
      <div className="font-display text-[28px] leading-none font-bold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

/**
 * The top of a screen: a red kicker, a large condensed flush-left heading and one muted line, with at most one action
 * on the right.
 */
export function PageHeader({ title, subtitle, action, kicker }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; kicker?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="mr-auto flex min-w-0 flex-col gap-1">
        {kicker && <span className="kicker">{kicker}</span>}
        <h1 className="text-[28px] leading-tight sm:text-[34px]">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** A segmented control of links: the current one tinted with the accent. Scrolls sideways if it does not fit. */
export function Tabs({ items, current }: { items: { key: string; label: ReactNode; href: string }[]; current: string }) {
  return (
    <nav className="mb-5 flex max-w-full overflow-x-auto">
      <div className="flex shrink-0 overflow-hidden rounded-md border border-line bg-surface">
        {items.map((t) => {
          const active = t.key === current;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "caps px-3.5 py-1.5 text-[13px] whitespace-nowrap no-underline hover:no-underline",
                active ? "bg-ink text-page hover:text-page" : "text-soft hover:bg-hover hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** A heading for a block on a screen, with a muted note beside it. */
export function SectionTitle({ title, note, action }: { title: ReactNode; note?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <h3 className="caps text-[17px]">{title}</h3>
      {note && <span className="text-xs text-muted">{note}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

export function Field({ label, error, className, ...props }: ComponentProps<"input"> & { label: string; error?: string }) {
  return (
    <div className={className}>
      <label className="relative block">
        <input
          placeholder=" "
          className={cx(
            "peer block h-[3.25rem] w-full rounded-md border bg-surface px-3 pt-5 pb-1.5 text-ink caret-accent transition hover:border-[color-mix(in_srgb,var(--ink)_40%,transparent)] focus:outline-none",
            error ? "border-bad" : "border-line focus:border-accent",
          )}
          {...props}
        />
        <span className="pointer-events-none absolute top-0 left-0 origin-top-left translate-x-3 translate-y-3.5 text-muted transition-transform peer-focus:translate-y-1.5 peer-focus:scale-80 peer-focus:text-accent peer-[:not(:placeholder-shown)]:translate-y-1.5 peer-[:not(:placeholder-shown)]:scale-80">
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
      <div className="mb-5 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-muted">{children}</div>}
    </div>
  );
}

/** Small outlined actions for rows (Nudge, Open, Require retake): the accent one is the suggested fix. */
const outline =
  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] whitespace-nowrap no-underline transition-colors hover:no-underline disabled:cursor-not-allowed disabled:opacity-45";
export const accentOutline = cx(outline, "border-accent bg-surface font-semibold text-accent-ink hover:bg-accent-soft hover:text-accent-ink");
export const quietOutline = cx(outline, "border-line bg-surface text-ink hover:bg-hover hover:text-ink");

export { cx };
