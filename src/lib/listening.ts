import "server-only";
import { db } from "./db";
import type { VocabItem } from "./listening-format";
import { answerKey, estimateBand, type QuestionGroup } from "./passage-format";

/** One question's state inside ListeningAttempt.answers. */
export type ListeningAnswer = { answer: string; correct: boolean; firstCorrect: boolean; tries: number; wrong: string[] };
export type ListeningAnswers = Record<string, ListeningAnswer>;

export type ListeningView = {
  id: string;
  submitted: boolean;
  completed: boolean;
  firstCorrect: number | null;
  total: number;
  band: number | null;
  /** per question: what the student wrote, whether it is right, how many tries, answers already marked wrong */
  questions: Record<number, { answer: string; correct: boolean; firstCorrect: boolean; tries: number; wrong: string[] }>;
};

export function viewOf(attempt: { id: string; firstSubmittedAt: Date | null; completedAt: Date | null; firstCorrect: number | null; band: number | null; answers: unknown }, total: number): ListeningView {
  const answers = attempt.answers as ListeningAnswers;
  return {
    id: attempt.id,
    submitted: !!attempt.firstSubmittedAt,
    completed: !!attempt.completedAt,
    firstCorrect: attempt.firstCorrect,
    total,
    band: attempt.band,
    questions: Object.fromEntries(Object.entries(answers).map(([n, a]) => [Number(n), a])),
  };
}

export async function lessonAndAttempt(userId: string, slug: string) {
  const lesson = await db.listeningLesson.findUnique({ where: { slug } });
  if (!lesson) return null;
  const attempt =
    (await db.listeningAttempt.findFirst({ where: { userId, lessonId: lesson.id }, orderBy: { startedAt: "desc" } })) ??
    (await db.listeningAttempt.create({ data: { userId, lessonId: lesson.id } }));
  return { lesson, attempt };
}

async function ownAttempt(userId: string, attemptId: string) {
  const attempt = await db.listeningAttempt.findFirst({ where: { id: attemptId, userId }, include: { lesson: true } });
  if (!attempt) throw new Error("Attempt not found");
  return attempt;
}

/** First submission: every question graded once; this alone gives the score and band. */
export async function submitListening(userId: string, attemptId: string, given: Record<string, string>) {
  const attempt = await ownAttempt(userId, attemptId);
  if (attempt.firstSubmittedAt) return attempt;
  const keys = answerKey(attempt.lesson.questions as QuestionGroup[]);
  const answers: ListeningAnswers = {};
  for (const k of keys) {
    const answer = (given[k.number] ?? "").trim().slice(0, 120);
    const correct = !!answer && k.check(answer);
    answers[k.number] = { answer, correct, firstCorrect: correct, tries: 1, wrong: correct || !answer ? [] : [answer] };
  }
  const firstCorrect = Object.values(answers).filter((a) => a.correct).length;
  const now = new Date();
  return db.listeningAttempt.update({
    where: { id: attemptId },
    data: {
      answers,
      firstSubmittedAt: now,
      firstCorrect,
      band: estimateBand(firstCorrect, keys.length, "listening"),
      completedAt: firstCorrect === keys.length ? now : null,
    },
  });
}

/** A red question can be checked again with a new answer; the right answer is never revealed. */
export async function retryListening(userId: string, attemptId: string, number: number, given: string): Promise<{ error?: string }> {
  const attempt = await ownAttempt(userId, attemptId);
  const answers = attempt.answers as ListeningAnswers;
  const current = answers[number];
  if (!attempt.firstSubmittedAt || !current) return { error: "Submit your answers first." };
  if (current.correct) return { error: "This question is already correct." };
  const answer = given.trim().slice(0, 120);
  if (!answer) return { error: "Write an answer." };
  if (current.wrong.some((w) => w.toLowerCase() === answer.toLowerCase())) return { error: "You already tried this answer. Listen to that part again." };

  const key = answerKey(attempt.lesson.questions as QuestionGroup[]).find((k) => k.number === number);
  if (!key) return { error: "Question not found." };
  const correct = key.check(answer);
  const next: ListeningAnswers = {
    ...answers,
    [number]: { ...current, answer, correct, tries: current.tries + 1, wrong: correct ? current.wrong : [...current.wrong, answer] },
  };
  const done = Object.values(next).every((a) => a.correct);
  await db.listeningAttempt.update({ where: { id: attemptId }, data: { answers: next, ...(done ? { completedAt: new Date() } : {}) } });
  return {};
}

export const vocabularyOf = (lesson: { vocabulary: unknown }) => lesson.vocabulary as VocabItem[];
