import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, PageSkeleton, cx } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ListeningAnswers } from "@/lib/listening";
import { formatDay } from "@/lib/time";

export const metadata: Metadata = { title: "Listening" };

/** The library of video lessons assigned to this student, one row each, with their progress. */
async function LibraryContent() {
  const user = await requireStudent();
  // Each assigned lesson with the student's latest practice (the latest with results first: each visit starts a fresh
  // one, which should not hide them): one statement.
  const rows = await db.$queryRaw<
    {
      id: string;
      slug: string;
      title: string;
      videoId: string;
      total: number;
      wordCount: number;
      dueAt: Date | null;
      note: string | null;
      done: Date | null;
      started: boolean;
      firstSubmittedAt: Date | null;
      completedAt: Date | null;
      firstCorrect: number | null;
      band: number | null;
      answers: unknown;
    }[]
  >`
    SELECT l.id, l.slug, l.title, l."videoId", l.total, l."wordCount", a."dueAt", a.note, r."completedAt" AS done,
           x."lessonId" IS NOT NULL AS started, x."firstSubmittedAt", x."completedAt", x."firstCorrect", x.band, x.answers
    FROM "AssignmentRecipient" r
    JOIN "Assignment" a ON a.id = r."assignmentId"
    JOIN "ListeningLesson" l ON l.id = a."lessonId" AND l."archivedAt" IS NULL
    LEFT JOIN LATERAL (
      SELECT y."lessonId", y."firstSubmittedAt", y."completedAt", y."firstCorrect", y.band, y.answers
      FROM "ListeningAttempt" y WHERE y."userId" = r."studentId" AND y."lessonId" = l.id AND y."invalidatedAt" IS NULL
      ORDER BY y."firstSubmittedAt" DESC NULLS LAST, y."startedAt" DESC LIMIT 1
    ) x ON true
    WHERE r."studentId" = ${user.id}
    ORDER BY r."completedAt" ASC NULLS FIRST, a."dueAt" ASC NULLS LAST`;
  const latest = new Map(rows.filter((r) => r.started).map((r) => [r.id, r]));
  const now = new Date();
  const lessons = rows.map((r) => ({ id: r.id, slug: r.slug, title: r.title, videoId: r.videoId, total: r.total, wordCount: r.wordCount, dueAt: r.dueAt, note: r.note, done: r.done }));

  return (
    <>
      <PageHeader kicker="Practice · Listening" title="Listening" />
      <div className="max-w-3xl">
        {lessons.length === 0 ? (
          <Card className="py-8 text-center text-muted">Nothing assigned yet. Ask your teacher.</Card>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface shadow-bubble">
            {lessons.map((l) => {
              const a = latest.get(l.id);
              const red = a ? Object.values(a.answers as ListeningAnswers).filter((q) => !q.correct).length : 0;
              const status = !a?.firstSubmittedAt
                ? { text: a ? "In progress" : "Not started", tone: a ? "text-accent" : "text-muted" }
                : a.completedAt
                  ? { text: `Done · ${a.firstCorrect}/${l.total} · band ${a.band}`, tone: "text-good" }
                  : { text: `${red} to correct · ${a.firstCorrect}/${l.total}`, tone: "text-bad" };
              const words = l.wordCount;
              return (
                <li key={l.id}>
                  <Link href={`/student/listening/${l.slug}`} className="flex items-center gap-4 px-4 py-3 text-ink no-underline hover:bg-hover hover:no-underline">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a small YouTube thumbnail, loaded lazily */}
                    <img src={`https://i.ytimg.com/vi/${l.videoId}/mqdefault.jpg`} alt="" loading="lazy" width={96} height={54} className="h-[54px] w-24 shrink-0 rounded-md bg-grid object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{l.title}</span>
                      <span className="block truncate text-sm text-muted">
                        {l.total} questions{words ? ` · ${words} key words` : ""}
                        {l.dueAt && (
                          <span className={cx(!l.done && l.dueAt < now && "font-medium text-bad")}>
                            {" "}· {l.dueAt < now && !l.done ? "was due" : "due"} {formatDay(l.dueAt, true)}
                          </span>
                        )}
                        {l.note && ` · ${l.note}`}
                      </span>
                    </span>
                    <span className={cx("shrink-0 text-sm tabular-nums", status.tone)}>{status.text}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 px-1 text-sm text-muted">Videos need internet.</p>
      </div>
    </>
  );
}

export default function ListeningLibraryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LibraryContent />
    </Suspense>
  );
}
