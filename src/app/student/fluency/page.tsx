import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
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
    <>
      <PageHeader
        title="Speed reading"
        subtitle={`Your target: ${target} words a minute${best ? ` · best ${Math.round(best)}` : ""}`}
      />
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 text-muted">Read an easy text a little faster than usual, then answer one question. Easy, fast reading builds fluency.</p>
        {candidates.length === 0 ? (
          <Card className="py-8 text-center text-muted">No easy texts yet. Finish a few texts first, then come back to read them faster.</Card>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface shadow-bubble">
            {candidates.map((t) => (
              <li key={t.id}>
                <Link href={`/student/fluency/${t.slug}`} className="flex items-center gap-4 px-4 py-3 text-ink no-underline hover:bg-hover hover:no-underline">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.title}</span>
                    <span className="block truncate text-sm text-muted">{t.completed ? "Read before" : "Easy read"} · {t.wordCount} words</span>
                  </span>
                  {bestByText.has(t.id) && <span className="shrink-0 text-sm text-muted tabular-nums">Best {Math.round(bestByText.get(t.id)!)} wpm</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default function FluencyPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FluencyContent />
    </Suspense>
  );
}
