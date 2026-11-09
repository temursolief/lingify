import { PageSkeleton } from "@/components/ui";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildVocabItems } from "@/lib/exercises";
import { libraryFor } from "@/lib/recommend";
import { PLEASURE_COVERAGE, type GrammarPoint, type Question } from "@/lib/texts";
import { Practice } from "./practice";

export const metadata: Metadata = { title: "Practice" };

async function PracticePageContent(props: PageProps<"/student/read/[slug]/practice">) {
  const user = await requireStudent();
  const { slug } = await props.params;
  const { session: sessionId } = await props.searchParams;

  const text = await db.text.findUnique({ where: { slug } });
  if (!text) notFound();
  const session = await db.readingSession.findFirst({
    where: { userId: user.id, textId: text.id, completedAt: { not: null }, ...(typeof sessionId === "string" ? { id: sessionId } : {}) },
    orderBy: { completedAt: "desc" },
  });
  if (!session) redirect(`/student/read/${slug}`);

  const [vocab, library] = await Promise.all([
    buildVocabItems(user.id, text, session.startedAt),
    libraryFor(user.id),
  ]);
  const next = library.find((t) => t.level !== "locked" && !t.completed && t.id !== text.id);

  return (
    <Practice
      sessionId={session.id}
      title={text.title}
      wpm={session.wpm && Math.round(session.wpm)}
      minutes={Math.max(1, Math.round(session.activeSeconds / 60))}
      optional={session.coverage >= PLEASURE_COVERAGE}
      questions={(text.questions as Question[]).map(({ question, options }) => ({ question, options }))}
      grammar={(text.grammar as GrammarPoint[]).map((g) => ({
        structure: g.structure,
        explanation: g.explanation,
        example: g.example,
        question: g.exercise.question,
        options: g.exercise.options,
      }))}
      vocab={vocab}
      next={next ? { slug: next.slug, title: next.title } : null}
    />
  );
}

export default function PracticePage(props: PageProps<"/student/read/[slug]/practice">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PracticePageContent {...props} />
    </Suspense>
  );
}
