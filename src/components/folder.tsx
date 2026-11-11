import Link from "next/link";
import type { ReactNode } from "react";
import { Skeleton, cx } from "./ui";

export type FolderItem = {
  href: string;
  label: string;
  /** one muted line under the name: what is inside, or what to do next */
  subtitle?: string;
  /** a count in a round badge on the tab, like unread messages */
  badge?: number;
  /** a colour from the theme, e.g. "var(--series-1)" */
  color: string;
  /** a short word on the sheet peeking out of the folder */
  peek?: string;
};

/**
 * A big folder card for the home page: a tab, a sheet of paper peeking out, and the front with the name. Plain CSS
 * and a link, no script: on a phone a tap opens it (the folder dips while pressed), on a desktop the sheet rises on hover.
 */
export function Folder({ href, label, subtitle, badge, color, peek }: FolderItem) {
  const tint = (p: number) => `color-mix(in oklab, ${color} ${p}%, var(--surface))`;
  return (
    <Link
      href={href}
      className="group relative block h-40 rounded-2xl text-ink no-underline outline-offset-4 transition-transform duration-150 hover:no-underline active:scale-[0.97] sm:h-44"
    >
      {/* the back, with its tab */}
      <span aria-hidden className="absolute top-0 left-0 h-6 w-[45%] rounded-t-xl" style={{ background: tint(55) }} />
      <span aria-hidden className="absolute inset-x-0 top-4 bottom-0 rounded-2xl rounded-tl-none" style={{ background: tint(55) }} />
      {/* the sheet */}
      <span
        aria-hidden
        className="absolute inset-x-4 top-7 h-20 rounded-lg bg-surface px-3 pt-2 text-[11px] font-medium tracking-wide text-muted uppercase shadow-sm transition-transform duration-200 ease-out group-hover:-translate-y-2 group-hover:-rotate-2 group-focus-visible:-translate-y-2"
      >
        {peek}
      </span>
      {/* the front */}
      <span
        className="absolute inset-x-0 top-14 bottom-0 flex flex-col justify-end rounded-2xl px-4 pb-3.5 shadow-[0_-1px_0_rgba(255,255,255,.5)_inset,0_6px_16px_-8px_rgba(16,35,47,.35)]"
        style={{ background: `linear-gradient(160deg, ${tint(28)}, ${tint(40)})` }}
      >
        <span className="block truncate text-[17px] leading-tight font-semibold">{label}</span>
        {subtitle && <span className="mt-0.5 line-clamp-2 text-sm leading-snug text-ink/65">{subtitle}</span>}
      </span>
      {!!badge && (
        <span className="absolute top-0 right-0 min-w-6 rounded-full bg-accent px-1.5 text-center text-[13px] leading-6 font-medium text-white tabular-nums shadow-sm">
          {badge}
        </span>
      )}
    </Link>
  );
}

/** A dashed, empty folder that adds something, e.g. "New class". */
export function NewFolder({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-muted no-underline transition-colors hover:border-accent hover:text-accent hover:no-underline active:scale-[0.97] sm:h-44"
    >
      <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <path d="M10 4v12M4 10h12" />
      </svg>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

/** `four`: exactly four folders, kept as 2 × 2 until there is room for one row of four. */
export function FolderGrid({ children, className, four }: { children: ReactNode; className?: string; four?: boolean }) {
  return (
    <div className={cx("grid grid-cols-2 gap-x-4 gap-y-5", four ? "xl:grid-cols-4" : "lg:grid-cols-3 xl:grid-cols-4", className)}>{children}</div>
  );
}

/** The grid while the counts load, below where the page header will be. */
export function FoldersSkeleton({ count = 4 }: { count?: number }) {
  return (
    <FolderGrid four={count === 4} className="mt-[calc(3.5rem+var(--pane))]">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-40 rounded-2xl sm:h-44" />
      ))}
    </FolderGrid>
  );
}
