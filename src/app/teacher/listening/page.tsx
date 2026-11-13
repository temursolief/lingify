import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { LibraryTabs } from "../library-tabs";
import { DeleteLessonButton, UploadPassageForm } from "../teacher-forms";

export const metadata: Metadata = { title: "Listening" };

async function LessonsContent() {
  await requireAdmin();
  const lessons = await db.listeningLesson.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, videoId: true, total: true, wordCount: true, _count: { select: { attempts: true } } },
  });
  return (
    <>
      <PageHeader
        kicker="Library"
        title="Listening"
        subtitle="Video lessons (e.g. TED-Ed) with IELTS Listening questions and key words, for every student"
        action={<Link href="/teacher/listening/format" className="text-sm">Format guide</Link>}
      />
      <LibraryTabs current="listening" />
      <div className="max-w-3xl space-y-4">
        <Card>
          <p className="font-semibold">Upload a lesson</p>
          <p className="mt-1 mb-3 text-sm text-muted">
            One JSON file: the YouTube link, the questions with their answers, and the key words. Start from the{" "}
            <a href="/samples/listening-example.json" download>TED-Ed example</a> and replace every “FILL IN” with the answer.
          </p>
          <UploadPassageForm lesson />
        </Card>
        {lessons.length > 0 && (
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {lessons.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small YouTube thumbnail */}
                  <img src={`https://i.ytimg.com/vi/${l.videoId}/mqdefault.jpg`} alt="" loading="lazy" width={96} height={54} className="h-[54px] w-24 shrink-0 rounded-md bg-grid object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.title}</span>
                    <span className="block text-sm text-muted">{l.total} questions · {l.wordCount} key words · {l._count.attempts} students started</span>
                  </span>
                  <DeleteLessonButton id={l.id} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

export default function TeacherListeningPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LessonsContent />
    </Suspense>
  );
}
