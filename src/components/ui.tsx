import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Telegram-style buttons: one filled blue action, everything else a quiet blue text button. */
const buttonStyles = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "bg-accent-soft text-accent hover:bg-[#dcebfb]",
  ghost: "bg-transparent text-muted hover:bg-hover hover:text-ink",
};

type Variant = keyof typeof buttonStyles;

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-[15px] font-medium leading-5 no-underline hover:no-underline transition-colors disabled:pointer-events-none disabled:opacity-50";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

/** A white rounded "bubble" on the grey content area. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl bg-surface p-4 shadow-bubble", className)} {...props} />;
}

const badgeTones = {
  neutral: "bg-grid text-muted",
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
  const fill = { accent: "bg-accent", good: "bg-good", warn: "bg-[#f0a020]" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-grid" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx("h-full rounded-full transition-all", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface p-3 shadow-bubble">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-sm text-muted">{hint}</div>}
    </div>
  );
}

/**
 * The bar across the top of the open pane, like a Telegram chat header: title, one muted line under it,
 * and at most one action on the right. It sticks while the page scrolls.
 */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 flex min-h-14 items-center justify-between gap-4 border-b border-line bg-bar px-6 py-2">
      <div className="min-w-0">
        <h1 className="truncate text-base leading-tight font-semibold">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Telegram folder tabs: plain words, the current one in blue with a rounded underline. */
export function Tabs({ items, current }: { items: { key: string; label: ReactNode; href: string }[]; current: string }) {
  return (
    <nav className="-mx-6 -mt-6 mb-6 flex gap-1 overflow-x-auto border-b border-line bg-bar px-4">
      {items.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative px-3 py-2.5 text-[15px] font-medium whitespace-nowrap no-underline hover:no-underline",
              active ? "text-accent" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {active && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function Field({ label, error, className, ...props }: ComponentProps<"input"> & { label: string; error?: string }) {
  return (
    <div className={className}>
      <label className="relative block">
        <input
          placeholder=" "
          className={cx(
            "peer block h-[3.25rem] w-full rounded-md border bg-surface px-3 pt-5 pb-1.5 text-ink transition focus:outline-none",
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
      <div className="-mx-6 -mt-6 mb-6 flex h-14 items-center border-b border-line bg-bar px-6">
        <Skeleton className="h-4 w-40" />
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

export { cx };
