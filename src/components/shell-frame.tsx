"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * The frame every signed-in screen sits in. On a desktop or a wide tablet it is Telegram Desktop's two columns: the
 * list on the left, the open section on the right, each scrolling on its own. On a phone or a narrow tablet the
 * list becomes a drawer behind a menu button, so the open section gets the whole screen.
 * `action`: a button next to the app name (the teacher's "+"), in the list column and in the phone's top bar.
 */
export function ShellFrame({
  brand,
  nav,
  footer,
  banner,
  action,
  children,
}: {
  brand: ReactNode;
  nav: ReactNode;
  footer?: ReactNode;
  banner?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:grid lg:grid-cols-[clamp(240px,28vw,320px)_minmax(0,1fr)]">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-bar px-2 lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-hover"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        </button>
        <span className="text-lg font-semibold">{brand}</span>
        {action && <div className="ml-auto">{action}</div>}
      </header>

      {open && <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default bg-black/30 lg:hidden" />}

      <aside
        // Choosing a row closes the drawer: the section opens underneath it.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, [data-close-menu]")) setOpen(false);
        }}
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-[min(20rem,86vw)] flex-col border-r border-line bg-bar transition-[translate,visibility] duration-200",
          "lg:visible lg:static lg:z-auto lg:w-auto lg:min-h-0 lg:translate-x-0 lg:transition-none",
          open ? "translate-x-0 shadow-xl lg:shadow-none" : "invisible -translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between pr-3 pl-5">
          <span className="text-lg font-semibold">{brand}</span>
          {action}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">{nav}</div>
        {footer && <div className="shrink-0 border-t border-line px-2 py-2">{footer}</div>}
      </aside>

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
