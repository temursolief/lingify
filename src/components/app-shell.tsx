import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getSession } from "@/lib/auth";
import { Avatar } from "./avatar";
import { OfflineBanner } from "./offline-banner";
import { TopShell } from "./top-shell";

/** The signed-in layout: the top bar and the open screen. `end`: buttons on the right of the bar, before the account. */
export function AppShell({ home, settings, end, children }: { home: string; settings: string; end?: ReactNode; children: ReactNode }) {
  return (
    <TopShell
      home={home}
      banner={<OfflineBanner />}
      end={
        <>
          {end}
          {/* Kept the size of the button while it loads, so nothing in the bar moves. */}
          <Suspense fallback={<div className="h-9 w-9" />}>
            <Account href={settings} />
          </Suspense>
        </>
      }
    >
      {children}
    </TopShell>
  );
}

/** The signed-in person's initials; opens Settings (where Log out lives). */
async function Account({ href }: { href: string }) {
  const name = (await getSession())?.name || "Account";
  return (
    <Link href={href} aria-label={`${name}: settings`} title="Settings" className="rounded-full no-underline hover:opacity-85">
      <Avatar label={name} color="#8e99a4" size={36} />
    </Link>
  );
}
