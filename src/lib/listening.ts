import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { completeAssignments } from "./assignments";
import { db } from "./db";
import type { VocabItem } from "./listening-format";
import { answerKey, estimateBand, type QuestionGroup } from "./passage-format";

/** Lessons a student may open: only the ones a teacher assigned to them. */
export function lessonVisibleTo(userId: string): Prisma.ListeningLessonWhereInput {
  return { assignments: { some: { recipients: { some: { studentId: userId } } } } };
}

/** One question's state inside ListeningAttempt.answers. */
export type ListeningAnswer = { answer: string; correct: boolean; firstCorrect: boolean; tries: number; wrong: string[] };
export type ListeningAnswers = Record<string, ListeningAnswer>;

export type ListeningView = {
  id: string;
  submitted: boolean;
  completed: boolean;
  /** true once the student may see the questions: pressed "I've read these words", or already had progress before the gate existed */
  vocabRead: boolean;
  firstCorrect: number | null;
  total: number;
  band: number | null;
  /** per question: what the student wrote, whether it is right, how many tries, answers already marked wrong */
  questions: Record<number, { answer: string; correct: boolean; firstCorrect: boolean; tries: number; wrong: string[] }>;
};

export function viewOf(
  attempt: {
    id: string;
    firstSubmittedAt: Date | null;
    completedAt: Date | null;
    vocabSeenAt: Date | null;
    firstCorrect: number | null;
    band: number | null;
    answers: unknown;
  },
  total: number,
): ListeningView {
  const answers = attempt.answers as ListeningAnswers;
  return {
    id: attempt.id,
    submitted: !!attempt.firstSubmittedAt,
    completed: !!attempt.completedAt,
    // A fresh attempt with no progress yet shows the gate; one that already has an answer or a submission (from
    // before this gate existed) counts as already read, so no one loses access to questions they were mid-way through.
    vocabRead: !!attempt.vocabSeenAt || !!attempt.firstSubmittedAt || Object.keys(answers).length > 0,
    firstCorrect: attempt.firstCorrect,
    total,
    band: attempt.band,
    questions: Object.fromEntries(Object.entries(answers).map(([n, a]) => [Number(n), a])),
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The one shared deck for a lesson's key words, named "{title} Vocabulary" and linked by lesson ID: created once,
 * when the lesson is first uploaded or (for a lesson that already existed) the first time it is opened after this
 * existed. Every student's own schedule for these cards lives in their own CardState rows, so nothing is copied.
 */
export async function ensureLessonDeck(lesson: { id: string; title: string; vocabulary: unknown }) {
  const existing = await db.deck.findUnique({ where: { lessonId: lesson.id }, select: { id: true } });
  if (existing) return existing;
  const vocab = vocabularyOf(lesson);
  if (!vocab.length) return null;
  const deck = await db.deck.create({ data: { name: `${lesson.title} Vocabulary`, lessonId: lesson.id } });
  await db.card.createMany({
    data: vocab.map((v, position) => {
      const pattern = new RegExp(`\\b${v.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*`, "i");
      const front = v.example && pattern.test(v.example)
        ? `<div class="sentence">${esc(v.example).replace(pattern, '<span class="cloze">[...]</span>')}</div>`
        : `<div class="chunk">${esc(v.word)}</div>`;
      const back = [
        v.example ? `<div class="sentence">${esc(v.example)}</div><hr>` : "",
        `<div class="chunk">${esc(v.word)}</div>`,
        `<div class="meaning">${esc(v.meaning)}</div>`,
        v.uz ? `<div class="uz">O‘zbekcha: ${esc(v.uz)}</div>` : "",
      ].join("");
      return { deckId: deck.id, front, back, noteType: "lesson-vocab", position };
    }),
  });
  return deck;
}

export async function lessonAndAttempt(userId: string, slug: string) {
  const lesson = await db.listeningLesson.findFirst({ where: { slug, ...lessonVisibleTo(userId) } });
  if (!lesson) return null;
  await ensureLessonDeck(lesson);
  const attempt =
    (await db.listeningAttempt.findFirst({ where: { userId, lessonId: lesson.id }, orderBy: { startedAt: "desc" } })) ??
    (await db.listeningAttempt.create({ data: { userId, lessonId: lesson.id } }));
  return { lesson, attempt };
}

/** The student has pressed "I've read these words"; the questions unlock. Does nothing if already set. */
export async function markVocabSeen(userId: string, attemptId: string) {
  await db.listeningAttempt.updateMany({ where: { id: attemptId, userId, vocabSeenAt: null }, data: { vocabSeenAt: new Date() } });
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
  const allCorrect = firstCorrect === keys.length;
  const now = new Date();
  const result = await db.listeningAttempt.update({
    where: { id: attemptId },
    data: {
      answers,
      firstSubmittedAt: now,
      firstCorrect,
      band: estimateBand(firstCorrect, keys.length, "listening"),
      completedAt: allCorrect ? now : null,
    },
  });
  if (allCorrect) await completeAssignments(userId, { lessonId: attempt.lessonId }, now);
  return result;
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
  const now = new Date();
  await db.listeningAttempt.update({ where: { id: attemptId }, data: { answers: next, ...(done ? { completedAt: now } : {}) } });
  if (done) await completeAssignments(userId, { lessonId: attempt.lessonId }, now);
  return {};
}

export const vocabularyOf = (lesson: { vocabulary: unknown }) => lesson.vocabulary as VocabItem[];
