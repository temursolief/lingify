import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { libraryFor } from "@/lib/recommend";
import { MIN_COVERAGE } from "@/lib/texts";
import { LibraryBrowser } from "./library-browser";

export const metadata: Metadata = { title: "Read" };

async function LibraryPageContent({ searchParams }: PageProps<"/student/library">) {
  const user = await requireStudent();
  const { stopped } = await searchParams;
  const [library, recent] = await Promise.all([
    libraryFor(user.id),
    db.readingSession.findMany({ where: { userId: user.id, wpm: { not: null } }, orderBy: { completedAt: "desc" }, take: 5, select: { wpm: true } }),
  ]);
  const wpm = recent.length ? recent.reduce((n, r) => n + r.wpm!, 0) / recent.length : 110;
  return (
    <>
      <PageHeader title="Read" subtitle={`Texts open when you know ${MIN_COVERAGE * 100}% of their words · best match first`} />
      <div className="mx-auto max-w-3xl">
        {stopped && (
          <p className="mb-4 rounded-xl bg-good-soft px-4 py-3 text-sm text-good">
            No problem. Choosing what to read is part of being a good reader. Here are other texts you might enjoy.
          </p>
        )}
        <LibraryBrowser entries={library} wpm={Math.round(wpm)} />
      </div>
    </>
  );
}

export default function LibraryPage(props: PageProps<"/student/library">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LibraryPageContent {...props} />
    </Suspense>
  );
}
