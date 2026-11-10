import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { OfflineBanner } from "./offline-banner";
import { Skeleton } from "./ui";

export const CONTAINER = "mx-auto w-full max-w-[1140px] px-4";

/**
 * Telegram Desktop layout: a fixed list column on the left, the open section on the right.
 * Each pane scrolls on its own, so the list never moves while the student reads.
 */
export function AppShell({ home, nav, footer, children }: { home: string; nav: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid h-dvh grid-cols-[clamp(240px,28vw,320px)_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 flex-col border-r border-line bg-bar">
        <div className="flex h-14 shrink-0 items-center px-5">
          <Link href={home} className="text-lg font-semibold text-ink no-underline hover:no-underline">Lingify</Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          <Suspense fallback={<NavSkeleton />}>{nav}</Suspense>
        </div>
        {footer && <div className="shrink-0 border-t border-line px-2 py-2">{footer}</div>}
      </aside>
      <main className="flex min-h-0 flex-col">
        <OfflineBanner />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 pt-6 pb-12">{children}</div>
        </div>
      </main>
    </div>
  );
}

function NavSkeleton() {
  return (
    <div className="space-y-1 px-2">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2.5 py-2">
          <Skeleton className="h-[42px] w-[42px] rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}
