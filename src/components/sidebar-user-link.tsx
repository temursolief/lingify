"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "./nav-links";
import { cx } from "./ui";

export function SidebarUserLink({ href, name }: { href: string; name: string }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-lg px-2.5 py-1.5 no-underline hover:no-underline",
        active ? "bg-accent text-white" : "text-ink hover:bg-hover",
      )}
    >
      <Avatar label={name} color="#8e99a4" size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className={cx("block text-sm", active ? "text-white/80" : "text-muted")}>Settings</span>
      </span>
    </Link>
  );
}
