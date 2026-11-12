import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/ui";
import { proctoringFor } from "@/lib/assignments";
import { requireStudent } from "@/lib/auth";
import { lessonAndAttempt, vocabularyOf, viewOf } from "@/lib/listening";
import { publicGroups, type QuestionGroup } from "@/lib/passage-format";
import { ListeningLesson } from "./listening-lesson";

export const metadata: Metadata = { title: "Listening" };

/** The teacher's JSON becomes this page: video, key words and questions, with answers kept on the server. */
async function LessonContent(props: PageProps<"/student/listening/[slug]">) {
  const user = await requireStudent();
  const { slug } = await props.params;
  const found = await lessonAndAttempt(user.id, slug);
  if (!found) notFound();
  const { lesson, attempt } = found;
  const policy = await proctoringFor(user.id, { lessonId: lesson.id });
  // The questions are sent only once the test has started.
  const started = !!attempt.testStartedAt || !!attempt.firstSubmittedAt;
  return (
    <ListeningLesson
      lesson={{ id: lesson.id, title: lesson.title, videoId: lesson.videoId }}
      policy={policy}
      groups={started ? publicGroups(lesson.questions as QuestionGroup[]) : null}
      vocabulary={vocabularyOf(lesson).map((v) => ({ ...v, uz: user.uzbekGlosses ? v.uz : undefined }))}
      initial={viewOf(attempt, lesson.total)}
    />
  );
}

export default function LessonPage(props: PageProps<"/student/listening/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LessonContent {...props} />
    </Suspense>
  );
}
