"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type NewMenuItem = { href: string; label: string; hint: string; icon: keyof typeof ICONS };

const ICONS = {
  class: (
    <>
      <circle cx="7.5" cy="7" r="2.75" />
      <path d="M2.5 16c.6-2.7 2.6-4.25 5-4.25s4.4 1.55 5 4.25" />
      <path d="M13 4.6a2.6 2.6 0 0 1 0 4.8M14.5 11.9c1.5.5 2.6 1.9 3 4.1" />
    </>
  ),
  passage: (
    <>
      <path d="M5 2.75h6.5L15 6.25v11H5z" />
      <path d="M11.25 2.75v3.75H15M7.5 10h5M7.5 13h5" />
    </>
  ),
  listening: (
    <>
      <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="2.5" />
      <path d="M8.5 7.75v4.5l3.75-2.25z" />
    </>
  ),
  deck: (
    <>
      <rect x="5.75" y="2.75" width="9.5" height="12.5" rx="1.75" />
      <path d="M3.5 5.5v10.25c0 .8.65 1.5 1.5 1.5h7.75" />
    </>
  ),
} satisfies Record<string, ReactNode>;

/**
 * The "+" in the top bar: everything a teacher can add (a class, passages, lessons, decks) is behind this one
 * button, so the home page only shows their classes.
 */
export function NewMenu({ items }: { items: NewMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Add new"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink aria-expanded:bg-hover aria-expanded:text-ink"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
          <path d="M10 4v12M4 10h12" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-line bg-surface p-1 shadow-xl">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-ink no-underline transition-colors hover:bg-hover hover:no-underline"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden>
                {ICONS[item.icon]}
              </svg>
              <span className="min-w-0">
                <span className="block font-medium">{item.label}</span>
                <span className="block truncate text-sm text-muted">{item.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
