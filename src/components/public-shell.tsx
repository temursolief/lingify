import Link from "next/link";
import type { ReactNode } from "react";
import { CONTAINER, SiteFooter } from "./app-shell";

export function PublicShell({ children, hideLogin = false, hideSignup = false }: { children: ReactNode; hideLogin?: boolean; hideSignup?: boolean }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 bg-bar">
        <div className={`${CONTAINER} flex items-center py-2`}>
          <Link href="/" className="py-[5px] text-xl text-black no-underline">Lingify</Link>
          <div className="ml-auto flex items-center gap-1">
            {!hideLogin && <Link href="/login" className="rounded-md p-2 text-nav no-underline hover:text-ink">Log In</Link>}
            {!hideSignup && (
              <Link href="/signup" className="rounded-md border border-accent bg-accent px-3 py-1.5 text-accent-ink no-underline hover:bg-accent-hover">
                Sign Up
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className={`${CONTAINER} flex-1 pt-4 pb-8`}>{children}</main>
      <SiteFooter links={[{ href: "/", label: "About" }, { href: "/login", label: "Log In" }, { href: "/signup", label: "Sign Up" }]} />
    </div>
  );
}
