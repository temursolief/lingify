import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, Stat, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { GRADUATE_STREAK } from "@/lib/srs";

export const metadata: Metadata = { title: "My words" };

async function WordsPageContent() {
  const user = await requireStudent();
  const now = new Date();
  const [learning, learned, knownCount] = await Promise.all([
    db.lemmaState.findMany({ where: { userId: user.id, status: "LEARNING" }, orderBy: { srsDue: "asc" } }),
    db.lemmaState.findMany({
      where: { userId: user.id, status: "KNOWN", source: { not: "PLACEMENT" } },
      orderBy: { knownAt: "desc" },
      take: 60,
    }),
    db.lemmaState.count({ where: { userId: user.id, status: "KNOWN" } }),
  ]);
  const texts = await db.text.findMany({
    where: { id: { in: [...new Set(learning.map((l) => l.contextTextId).filter(Boolean) as string[])] } },
    select: { id: true, title: true, slug: true },
  });
  const textById = new Map(texts.map((t) => [t.id, t]));
  const due = learning.filter((l) => l.srsDue && l.srsDue <= now).length;

  return (
    <div>
      <PageHeader title="My words" subtitle="Words you looked up while reading, and how close you are to knowing them." />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Learning" value={learning.length} hint={`${due} due now`} />
        <Stat label="Learned here" value={learned.length} hint="moved to known after reviews" />
        <Stat label="Known in total" value={knownCount.toLocaleString()} />
      </div>

      <Card>
        <h2 className="mb-1 font-semibold">Learning</h2>
        <p className="mb-4 text-sm text-muted">
          A word becomes known after {GRADUATE_STREAK} correct reviews in a row. Meeting it again in other texts helps too.
        </p>
        {learning.length === 0 ? (
          <EmptyState title="No words yet">Tap words while reading to collect them here.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {learning.map((w) => {
              const text = w.contextTextId ? textById.get(w.contextTextId) : null;
              const isDue = w.srsDue && w.srsDue <= now;
              return (
                <li key={w.lemma} className="grid gap-2 py-3 sm:grid-cols-[10rem_1fr_9rem] sm:items-center">
                  <div>
                    <span className="font-semibold">{w.lemma}</span>
                    {isDue && <Badge tone="accent" className="ml-2">Due</Badge>}
                  </div>
                  <div className="min-w-0 text-sm text-muted">
                    {w.contextSentence && <p className="truncate font-serif italic">“{w.contextSentence}”</p>}
                    {text && <Link href={`/student/read/${text.slug}`} className="text-xs underline">{text.title}</Link>}
                    <span className="text-xs"> · seen in {w.exposures} text{w.exposures === 1 ? "" : "s"} · looked up {w.lookups}×</span>
                  </div>
                  <div className="text-xs text-muted">
                    <ProgressBar value={w.srsStreak / GRADUATE_STREAK} label={`${w.lemma} progress`} />
                    <span className="mt-1 block">{w.srsStreak} / {GRADUATE_STREAK} reviews</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {learned.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-3 font-semibold">Recently learned</h2>
          <div className="flex flex-wrap gap-2">
            {learned.map((w) => <Badge key={w.lemma} tone="good">{w.lemma}</Badge>)}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function WordsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WordsPageContent />
    </Suspense>
  );
}
