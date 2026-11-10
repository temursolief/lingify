"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

/** `prefixes`: other paths under which this item counts as active; `exact`: active only on its own path. */
export type NavItem = { href: string; label: string; badge?: number; exact?: boolean; prefixes?: string[] };

/** Bootstrap navbar-light links: muted grey, the active one near-black, due counts in Anki's review green. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex">
      {items.map((item) => {
        const prefixes = item.prefixes ?? (item.exact ? [] : [item.href]);
        const active = pathname === item.href || prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx("flex items-center gap-1.5 whitespace-nowrap px-3 py-2 no-underline transition-colors", active ? "font-medium text-black" : "text-nav hover:text-black/70")}
          >
            {item.label}
            {!!item.badge && <span className="font-medium text-good tabular-nums">{item.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
