import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildVocabItems } from "@/lib/exercises";
import { grammarInfo, isPreview, MASTERY_CORRECT, readyStage } from "@/lib/grammar-sequence";
import { collocationQuestion, phraseQuestion } from "@/lib/lesson";
import { libraryFor } from "@/lib/recommend";
import {
  PLEASURE_COVERAGE,
  SKILL_LABEL,
  type Choice,
  type GrammarPoint,
  type Phrase,
  type SkillQuestion,
  type Token,
} from "@/lib/texts";
import { Practice } from "./practice";

export const metadata: Metadata = { title: "After reading" };

const withoutAnswer = ({ question, options }: Choice) => ({ question, options });

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

  const [vocab, library, grammarWins, rating, events] = await Promise.all([
    buildVocabItems(user.id, text, session.startedAt),
    libraryFor(user.id),
    db.exerciseAttempt.groupBy({ by: ["skill"], where: { userId: user.id, kind: "GRAMMAR", correct: true, skill: { not: null } }, _count: true }),
    db.textRating.findUnique({ where: { userId_textId: { userId: user.id, textId: text.id } } }),
    db.event.findMany({ where: { userId: user.id, textId: text.id, type: { in: ["lookup", "phrase_saved"] }, at: { gte: session.startedAt } } }),
  ]);
  const mastered = new Set(grammarWins.filter((g) => g._count >= MASTERY_CORRECT).map((g) => g.skill!));
  const stage = readyStage(mastered);

  const open = library.filter((t) => t.level !== "locked" && !t.completed && t.id !== text.id);
  const nextInSeries = text.series
    ? open
        .filter((t) => t.series === text.series && (t.seriesPart ?? 0) > (text.seriesPart ?? 0))
        .sort((a, b) => (a.seriesPart ?? 0) - (b.seriesPart ?? 0))[0]
    : undefined;
  const next = nextInSeries ?? open[0];

  const paragraphs = text.paragraphs as Token[][];
  const phrases = text.phrases as Phrase[];
  const prediction = text.prediction as Choice | null;
  // Practise up to 6 phrases: first the ones the student met by tapping a word or saving it, then the rest in order.
  const touched = new Set(events.flatMap((e) => {
    const d = e.data as { lemma?: string; phrase?: string };
    return [d.lemma, d.phrase].filter(Boolean) as string[];
  }));
  const phraseScore = (p: Phrase) =>
    touched.has(p.phrase.toLowerCase()) || p.marks.some((m) => paragraphs[m.p].slice(m.from, m.to + 1).some((t) => t.l && touched.has(t.l))) ? 0 : 1;
  const practisePhrases = phrases
    .map((p, index) => ({ p, index }))
    .sort((a, b) => phraseScore(a.p) - phraseScore(b.p) || a.index - b.index)
    .slice(0, 6);

  return (
    <Practice
      sessionId={session.id}
      textId={text.id}
      title={text.title}
      wpm={session.wpm && Math.round(session.wpm)}
      minutes={Math.max(1, Math.round(session.activeSeconds / 60))}
      optional={session.coverage >= PLEASURE_COVERAGE}
      lookBack={paragraphs.map((p) => p.map((t, i) => (i ? t.s : "") + t.v).join(""))}
      gist={text.gist ? withoutAnswer(text.gist as Choice) : null}
      prediction={
        prediction && session.prediction !== null
          ? { question: prediction.question, chosen: prediction.options[session.prediction] ?? null, actual: prediction.options[prediction.answer] }
          : null
      }
      questions={(text.questions as SkillQuestion[]).map((q) => ({ ...withoutAnswer(q), skill: SKILL_LABEL[q.skill] ?? q.skill }))}
      vocab={vocab}
      phrases={practisePhrases.map(({ p, index }) => {
        const mark = p.marks[0];
        const sentence = text.sentences[paragraphs[mark.p][mark.from].i];
        const colloc = collocationQuestion(phrases, index);
        return {
          index,
          phrase: p.phrase,
          inText: p.inText,
          meaning: p.meaning,
          uz: p.uz ?? null,
          sentence,
          ...withoutAnswer(phraseQuestion(phrases, index)),
          collocation: colloc ? { ...withoutAnswer(colloc), hint: colloc.hint } : null,
        };
      })}
      grammar={(text.grammar as GrammarPoint[]).map((g) => ({
        structure: g.structure,
        explanation: g.explanation,
        examples: g.examples,
        highlights: g.highlights,
        discovery: withoutAnswer(g.discovery),
        exercise: withoutAnswer(g.exercise),
        preview: isPreview(g.key, stage),
        stageLabel: `Stage ${grammarInfo(g.key)?.stage ?? "?"} of 5`,
      }))}
      grammarStage={stage}
      uzbek={user.uzbekGlosses}
      response={text.response}
      rating={rating ? { enjoyment: rating.enjoyment, difficulty: rating.difficulty, recommend: rating.recommend } : null}
      next={next ? { slug: next.slug, title: next.title, inSeries: next === nextInSeries } : null}
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
