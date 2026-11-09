"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export type NavItem = { href: string; label: string; badge?: number; exact?: boolean };

/** Bootstrap navbar-light links: muted grey, the active one near-black, due counts in Anki's review green. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx("flex items-center gap-1 whitespace-nowrap p-2 no-underline transition-colors", active ? "text-black/90" : "text-nav hover:text-black/70")}
          >
            {item.label}
            {!!item.badge && <span className="font-medium text-good tabular-nums">{item.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
