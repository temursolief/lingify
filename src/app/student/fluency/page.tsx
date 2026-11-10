import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { libraryFor } from "@/lib/recommend";

export const metadata: Metadata = { title: "Speed reading" };

const DEFAULT_TARGET = 120;
const MAX_TARGET = 250;

async function FluencyContent() {
  const user = await requireStudent();
  const [library, runs] = await Promise.all([
    libraryFor(user.id),
    db.fluencyRun.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, include: { text: { select: { title: true, slug: true } } } }),
  ]);
  const valid = runs.filter((r) => r.gistCorrect !== false && r.wpm <= 500);
  const best = valid.length ? Math.max(...valid.map((r) => r.wpm)) : null;
  const target = Math.min(MAX_TARGET, Math.round(((best ?? DEFAULT_TARGET / 1.1) * 1.1) / 5) * 5);
  const bestByText = new Map<string, number>();
  for (const r of valid) bestByText.set(r.textId, Math.max(bestByText.get(r.textId) ?? 0, r.wpm));
  // Fluency practice needs very easy material: pleasure reads, or texts the student has already read.
  const candidates = library
    .filter((t) => t.level === "pleasure" || (t.completed && t.level !== "locked"))
    .sort((a, b) => Number(b.completed) - Number(a.completed) || b.coverage - a.coverage);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Speed reading"
        subtitle="Read an easy text a little faster than usual, then answer one question. Easy, fast reading builds fluency."
        action={
          <div className="text-right">
            <div className="text-sm text-muted">Your target</div>
            <div className="text-[1.75rem] leading-none font-semibold tabular-nums">{target} wpm</div>
            {best && <div className="text-sm text-muted">best {Math.round(best)} wpm</div>}
          </div>
        }
      />
      <Card>
        <h2 className="font-semibold">Choose an easy text</h2>
        <p className="mb-4 text-sm text-muted">Texts you have already read, or where you know at least 98% of the words.</p>
        {candidates.length === 0 ? (
          <EmptyState title="No easy texts yet">Finish a few texts first, then come back to read them faster.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {candidates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link href={`/student/fluency/${t.slug}`} className="font-medium hover:underline">{t.title}</Link>
                  <p className="text-xs text-muted">{t.wordCount} words · you know {(t.coverage * 100).toFixed(1)}%</p>
                </div>
                <span className="flex items-center gap-2">
                  {t.completed && <Badge tone="good">Read before</Badge>}
                  {bestByText.has(t.id) && <Badge>Best {Math.round(bestByText.get(t.id)!)} wpm</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function FluencyPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FluencyContent />
    </Suspense>
  );
}
