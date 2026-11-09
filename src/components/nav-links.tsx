"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export type NavItem = { href: string; label: string; badge?: number; exact?: boolean };

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition",
              active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface hover:text-ink",
            )}
          >
            {item.label}
            {!!item.badge && (
              <span className="rounded-full bg-accent px-1.5 text-xs leading-5 text-accent-ink tabular-nums">{item.badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
