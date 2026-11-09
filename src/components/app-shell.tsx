import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { NavLinks, type NavItem } from "./nav-links";

export function AppShell({ home, nav, user, children }: { home: string; nav: ReactNode; user: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={home} className="text-lg font-semibold tracking-tight">Lingify</Link>
          <div className="order-3 w-full overflow-x-auto sm:order-none sm:w-auto sm:flex-1">
            <Suspense fallback={<div className="h-8" />}>{nav}</Suspense>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Suspense fallback={null}>{user}</Suspense>
            <form action={logout}>
              <button className="text-muted hover:text-ink">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

export function Nav({ items }: { items: NavItem[] }) {
  return <NavLinks items={items} />;
}
