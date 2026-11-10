import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, PageSkeleton, cx } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ListeningAnswers } from "@/lib/listening";

export const metadata: Metadata = { title: "Listening" };

/** The library of video lessons: one row each, with the student's progress. */
async function LibraryContent() {
  const user = await requireStudent();
  const [lessons, attempts] = await Promise.all([
    db.listeningLesson.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true, title: true, videoId: true, total: true, wordCount: true },
    }),
    db.listeningAttempt.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: "desc" },
      select: { lessonId: true, firstSubmittedAt: true, completedAt: true, firstCorrect: true, band: true, answers: true },
    }),
  ]);
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) if (!latest.has(a.lessonId)) latest.set(a.lessonId, a);

  return (
    <>
      <PageHeader title="Listening" subtitle="Watch a video lesson, answer the IELTS Listening questions and learn its key words" />
      <div className="mx-auto max-w-3xl">
        {lessons.length === 0 ? (
          <Card className="py-8 text-center text-muted">No lessons yet. Your teachers will add them soon.</Card>
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
                      <span className="block truncate text-sm text-muted">{l.total} questions{words ? ` · ${words} key words` : ""}</span>
                    </span>
                    <span className={cx("shrink-0 text-sm tabular-nums", status.tone)}>{status.text}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 px-1 text-sm text-muted">Videos need an internet connection. A video only starts loading when you press play.</p>
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
