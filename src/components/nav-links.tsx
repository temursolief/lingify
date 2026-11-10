"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

/** `prefixes`: other paths under which this row counts as open; `exact`: open only on its own path. */
export type NavItem = {
  href: string;
  label: string;
  /** one muted line under the title, like the last message in a Telegram chat list */
  subtitle?: string;
  /** a count in a round blue badge on the right, like unread messages */
  badge?: number;
  exact?: boolean;
  prefixes?: string[];
};

/** Telegram's avatar colours; each row keeps its own colour by position. */
const AVATAR = ["#e17076", "#7bc862", "#65aadd", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774"];

export function isActive(pathname: string, item: NavItem) {
  const prefixes = item.prefixes ?? (item.exact ? [] : [item.href]);
  return pathname === item.href || prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function Avatar({ label, color, size = 42 }: { label: string; color: string; size?: number }) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

/** The list column: one row per section, the open one filled blue like the selected chat in Telegram. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {items.map((item, i) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-lg px-2.5 py-2 no-underline hover:no-underline transition-colors",
              active ? "bg-accent text-white" : "text-ink hover:bg-hover",
            )}
          >
            <Avatar label={item.label} color={AVATAR[i % AVATAR.length]} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.label}</span>
              {item.subtitle && <span className={cx("block truncate text-sm", active ? "text-white/80" : "text-muted")}>{item.subtitle}</span>}
            </span>
            {!!item.badge && (
              <span
                className={cx(
                  "min-w-6 rounded-full px-1.5 text-center text-[13px] leading-6 font-medium tabular-nums",
                  active ? "bg-white text-accent" : "bg-accent text-white",
                )}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
