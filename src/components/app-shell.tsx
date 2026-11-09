import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { NavLinks, type NavItem } from "./nav-links";

export const CONTAINER = "mx-auto w-full max-w-[1140px] px-3";

export function SiteFooter({ links }: { links: { href: string; label: string }[] }) {
  return (
    <footer className="bg-bar">
      <nav className={`${CONTAINER} flex flex-wrap justify-center gap-x-6 gap-y-1 py-2`}>
        {links.map((l) => (
          <Link key={l.href + l.label} href={l.href} className="py-1 text-nav no-underline hover:text-ink">
            {l.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}

export function AppShell({
  home,
  nav,
  user,
  footer,
  children,
}: {
  home: string;
  nav: ReactNode;
  user: ReactNode;
  footer: { href: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 bg-bar">
        <div className={`${CONTAINER} flex flex-wrap items-center gap-x-4 py-2`}>
          <Link href={home} className="py-[5px] text-xl text-black no-underline">Lingify</Link>
          <div className="order-3 w-full overflow-x-auto md:order-none md:w-auto md:flex-1">
            <Suspense fallback={<div className="h-10" />}>{nav}</Suspense>
          </div>
          <div className="ml-auto flex items-center">
            <Suspense fallback={null}>{user}</Suspense>
            <form action={logout}>
              <button className="rounded-md p-2 text-nav hover:text-ink">Log Out</button>
            </form>
          </div>
        </div>
      </header>
      <main className={`${CONTAINER} flex-1 pt-4 pb-8`}>{children}</main>
      <SiteFooter links={footer} />
    </div>
  );
}

export function Nav({ items }: { items: NavItem[] }) {
  return <NavLinks items={items} />;
}
