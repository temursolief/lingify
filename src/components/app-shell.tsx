import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { NavLinks, type NavItem } from "./nav-links";

export const CONTAINER = "mx-auto w-full max-w-[1140px] px-4";

export function AppShell({ home, nav, settings, children }: { home: string; nav: ReactNode; settings: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 bg-bar">
        <div className={`${CONTAINER} flex items-center gap-6 py-1.5`}>
          <Link href={home} className="text-xl font-semibold text-black no-underline">Lingify</Link>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <Suspense fallback={<div className="h-10" />}>{nav}</Suspense>
          </div>
          <div className="flex items-center text-sm">
            <Link href={settings} className="p-2 text-nav no-underline hover:text-ink">Settings</Link>
            <form action={logout}>
              <button className="p-2 text-nav hover:text-ink">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className={`${CONTAINER} flex-1 pt-6 pb-12`}>{children}</main>
    </div>
  );
}

export function Nav({ items }: { items: NavItem[] }) {
  return <NavLinks items={items} />;
}
