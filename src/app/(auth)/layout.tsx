import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-xl font-semibold tracking-tight">
        Lingify
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">{children}</div>
    </div>
  );
}
