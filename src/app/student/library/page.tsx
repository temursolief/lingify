import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { libraryFor } from "@/lib/recommend";
import { MIN_COVERAGE } from "@/lib/texts";
import { LibraryBrowser } from "./library-browser";

export const metadata: Metadata = { title: "Library" };

async function LibraryPageContent() {
  const user = await requireStudent();
  const [library, recent] = await Promise.all([
    libraryFor(user.id),
    db.readingSession.findMany({ where: { userId: user.id, wpm: { not: null } }, orderBy: { completedAt: "desc" }, take: 5, select: { wpm: true } }),
  ]);
  const wpm = recent.length ? recent.reduce((n, r) => n + r.wpm!, 0) / recent.length : 110;
  return (
    <div>
      <PageHeader
        title="Library"
        subtitle={`Texts open when you know at least ${MIN_COVERAGE * 100}% of their words. Texts at 98% or more are pleasure reads.`}
      />
      <LibraryBrowser entries={library} wpm={Math.round(wpm)} />
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LibraryPageContent />
    </Suspense>
  );
}
