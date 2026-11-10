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
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="IELTS Reading"
        subtitle="Timed Academic passages with real question types: 20 minutes each, no dictionary."
        action={
          <div className="text-right">
            <div className="text-sm text-muted">Estimated band</div>
            <div className="text-[1.75rem] leading-none font-semibold tabular-nums">{estimate ?? "–"}</div>
          </div>
        }
      />
      <div>
        <table className="w-full text-left">
          <thead className="border-b border-line text-sm">
            <tr className="text-muted">
              <th className="py-2 pr-3 font-normal">Passage</th>
              <th className="py-2 pr-3 font-normal">You know</th>
              <th className="py-2 pr-3 text-right font-normal">Best score</th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {texts.map((t) => {
              const best = attempts.filter((a) => a.textId === t.id).sort((a, b) => b.correct - a.correct)[0];
              const { coverage } = coverageOf(t.lemmaCounts as LemmaCounts, known);
              return (
                <tr key={t.id}>
                  <td className="py-2.5 pr-3">
                    <Link href={`/student/ielts/${t.slug}`} className="no-underline hover:underline">{t.title}</Link>
                    <span className="block text-sm text-muted">{t.wordCount} words · {t.timeLimit} min</span>
                  </td>
                  <td className={`py-2.5 pr-3 tabular-nums ${coverage < 0.9 ? "text-warn" : ""}`}>{(coverage * 100).toFixed(0)}%</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{best ? `${best.correct}/${best.total} (band ${best.band})` : "–"}</td>
                  <td className="py-2.5 text-right">
                    <Link href={`/student/ielts/${t.slug}`}>{best ? "Try again" : "Start"}</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-muted">These passages are harder than the library, so they may feel difficult. That is normal. After a test, study the passage&apos;s words and phrases.</p>
      </div>

      <Card>
        <h2 className="font-semibold">Academic words <span className="font-normal text-muted">· {awl.known} of {awl.total} known</span></h2>
        <p className="mb-3 text-sm text-muted">The Academic Word List: 570 word families common in IELTS texts, most frequent first. Aim for sublists 1–3 first.</p>
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
  );
}

export default function IeltsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <IeltsContent />
    </Suspense>
  );
}
