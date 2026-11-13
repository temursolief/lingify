import Link from "next/link";
import type { ReactNode } from "react";

/** Like Telegram's sign-in screen: one centred white panel with the logo above it. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-6 flex flex-col items-center gap-3 text-ink no-underline hover:no-underline">
        <span aria-hidden className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-4xl font-semibold text-page">L</span>
        <span className="text-2xl font-semibold">Lingify</span>
      </Link>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-bubble">{children}</div>
    </main>
  );
}
