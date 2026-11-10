import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { OfflineBanner } from "./offline-banner";
import { ShellFrame } from "./shell-frame";
import { Skeleton } from "./ui";

export const CONTAINER = "mx-auto w-full max-w-[1140px] px-4";

/** The signed-in layout: the list column (a drawer on small screens) and the open section. See ShellFrame. */
export function AppShell({ home, nav, footer, children }: { home: string; nav: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <ShellFrame
      brand={<Link href={home} className="text-ink no-underline hover:no-underline">Lingify</Link>}
      nav={<Suspense fallback={<NavSkeleton />}>{nav}</Suspense>}
      footer={footer}
      banner={<OfflineBanner />}
    >
      {children}
    </ShellFrame>
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
