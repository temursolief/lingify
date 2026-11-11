"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** One step up: a section's page goes back to its list, a list back home. Paths without a page of their own are skipped. */
function parentOf(pathname: string, home: string) {
  const parts = pathname.split("/").filter(Boolean);
  do parts.pop();
  while (parts.length && (parts.at(-1) === "students" || parts.join("/") === "teacher/classes"));
  const parent = "/" + parts.join("/");
  return parent.length < home.length ? home : parent;
}

/**
 * The frame every signed-in screen sits in: a bar across the top (back, the app name, then the "+" and the account
 * on the right) and the open screen under it, full width. The home page's folders are the way into each section, so
 * there is no list column.
 */
export function TopShell({ home, end, banner, children }: { home: string; end?: ReactNode; banner?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const atHome = pathname === home;
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-bar px-2 sm:px-4">
        {!atHome && (
          <Link
            href={parentOf(pathname, home)}
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted no-underline hover:bg-hover hover:text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12.5 4.5 7 10l5.5 5.5" />
            </svg>
          </Link>
        )}
        <Link href={home} className="px-2 text-lg font-semibold text-ink no-underline hover:no-underline">
          Lingify
        </Link>
        <div className="ml-auto flex items-center gap-2">{end}</div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        {banner}
        {/* A size container: a full-height screen (a passage with its questions) fills it with `pane-fill`. */}
        <div className="min-h-0 flex-1 overflow-y-auto [container-type:size]">
          <div className="pane-x pt-(--pane) pb-12">{children}</div>
        </div>
      </main>
    </div>
  );
}
