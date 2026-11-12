import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ErrorBreakdownView } from "@/components/error-breakdown";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { studentSummary } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { errorBreakdown } from "@/lib/insights";
import { formatDay } from "@/lib/time";

export const metadata: Metadata = { title: "Progress" };

async function ProgressContent() {
  const user = await requireStudent();
  const [summary, breakdown, history] = await Promise.all([
    studentSummary(user.id),
    errorBreakdown([user.id]),
    db.passageAttempt.findMany({
      where: { userId: user.id, invalidatedAt: null, firstSubmittedAt: { not: null } },
      orderBy: { firstSubmittedAt: "desc" },
      take: 10,
      include: { passage: { select: { title: true, slug: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader
        title="Progress"
        subtitle={`${summary.band ? `Estimated band ${summary.band}` : "No band yet"} · ${summary.cardsThisWeek} flashcards this week · ${summary.streak}-day streak`}
      />
      <div className="mx-auto max-w-3xl space-y-4">
        <ErrorBreakdownView data={breakdown} />
        {history.length > 0 && (
          <Card className="p-0">
            <p className="px-4 pt-4 font-semibold">First tries</p>
            <ul className="mt-2 divide-y divide-line">
              {history.map((a) => (
                <li key={a.id}>
                  <Link href={`/student/passages/${a.passage.slug}`} className="flex items-center gap-4 px-4 py-2.5 text-ink no-underline hover:bg-hover hover:no-underline">
                    <span className="min-w-0 flex-1 truncate">{a.passage.title}</span>
                    <span className="text-sm text-muted tabular-nums">
                      {a.firstCorrect}/{a.total} · band {a.band} · {formatDay(a.firstSubmittedAt!)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

export default function ProgressPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProgressContent />
    </Suspense>
  );
}
