import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, PageSkeleton, ProgressBar } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { awlProgress } from "@/lib/awl";
import { db } from "@/lib/db";
import { coverageOf, type LemmaCounts } from "@/lib/texts";
import { wordSets } from "@/lib/vocab";

export const metadata: Metadata = { title: "IELTS Reading" };

async function IeltsContent() {
  const user = await requireStudent();
  const [texts, attempts, { known }] = await Promise.all([
    db.text.findMany({ where: { track: "ielts" }, orderBy: { title: "asc" }, select: { id: true, slug: true, title: true, summary: true, topics: true, wordCount: true, lemmaCounts: true, timeLimit: true } }),
    db.ieltsAttempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { text: { select: { title: true } } } }),
    wordSets(user.id),
  ]);
  const recent = attempts.slice(0, 3);
  const estimate = recent.length ? Math.round((recent.reduce((n, a) => n + a.band, 0) / recent.length) * 2) / 2 : null;
  const awl = awlProgress(known);

  return (
    <>
      <PageHeader
        title="IELTS Reading"
        subtitle={`${estimate ? `Estimated band ${estimate}` : "No band estimate yet"} · 20 minutes per passage, no dictionary`}
      />
      <div className="mx-auto max-w-3xl space-y-4">
        <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface shadow-bubble">
          {texts.map((t) => {
            const best = attempts.filter((a) => a.textId === t.id).sort((a, b) => b.correct - a.correct)[0];
            const { coverage } = coverageOf(t.lemmaCounts as LemmaCounts, known);
            return (
              <li key={t.id}>
                <Link href={`/student/ielts/${t.slug}`} className="flex items-center gap-4 px-4 py-3 text-ink no-underline hover:bg-hover hover:no-underline">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.title}</span>
                    <span className="block truncate text-sm text-muted">
                      {t.timeLimit} min · you know {(coverage * 100).toFixed(0)}% of the words
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-muted tabular-nums">{best ? `${best.correct}/${best.total} · band ${best.band}` : "Not taken"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted">These passages are harder than your reading texts. That is normal. After a test, study the passage&apos;s words and phrases.</p>

        <Card>
          <p className="font-semibold">Academic words <span className="font-normal text-muted">· {awl.known} of {awl.total} known</span></p>
          <p className="mb-3 text-sm text-muted">570 word families common in IELTS texts. Learn sublists 1–3 first.</p>
          <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {awl.sublists.map((s) => (
              <li key={s.sublist} className="grid grid-cols-[5rem_1fr_3.5rem] items-center gap-3 text-sm">
                <span>Sublist {s.sublist}</span>
                <ProgressBar value={s.known / s.total} label={`Sublist ${s.sublist}`} />
                <span className="text-right text-muted tabular-nums">{s.known}/{s.total}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

export default function IeltsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <IeltsContent />
    </Suspense>
  );
}
