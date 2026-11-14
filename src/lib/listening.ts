import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { recordFirstSubmit, settleHomework } from "./assignments";
import { markXpDirty } from "./xp-store";
import { db } from "./db";
import { wordCardHtml } from "./vocab-cards";
import type { VocabItem } from "./listening-format";
import { answerKey, estimateBand, type QuestionGroup } from "./passage-format";
import { assessFirstTry, type SubmissionMeta, type SubmissionReason } from "./telemetry";

/** Lessons a student may open: only the ones a teacher assigned to them, and not archived. */
export function lessonVisibleTo(userId: string): Prisma.ListeningLessonWhereInput {
  return { archivedAt: null, assignments: { some: { recipients: { some: { studentId: userId } } } } };
}

/** One question's state inside ListeningAttempt.answers. */
export type ListeningAnswer = { answer: string; correct: boolean; firstCorrect: boolean; tries: number; wrong: string[] };
export type ListeningAnswers = Record<string, ListeningAnswer>;

export type ListeningView = {
  id: string;
  /** the student pressed "Start test" */
  started: boolean;
  submitted: boolean;
  reason: SubmissionReason;
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
    testStartedAt: Date | null;
    submissionReason: SubmissionReason;
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
    started: !!attempt.testStartedAt,
    submitted: !!attempt.firstSubmittedAt,
    reason: attempt.submissionReason,
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
    data: vocab.map((v, position) => ({ deckId: deck.id, ...wordCardHtml(v), noteType: "lesson-vocab", position })),
  });
  return deck;
}

/**
 * Opening a lesson starts a fresh practice every time: an attempt whose first try was already submitted is never
 * reopened, so the student meets the key words and the questions anew. That attempt is kept as it was, and the
 * teacher still sees it (and every other try) with its results. An attempt not yet submitted, untouched or with a
 * test under way, is picked up again instead, so leaving mid-test cannot be used to get a clean slate.
 */
export async function lessonAndAttempt(userId: string, slug: string) {
  const lesson = await db.listeningLesson.findFirst({ where: { slug, ...lessonVisibleTo(userId) } });
  if (!lesson) return null;
  await ensureLessonDeck(lesson);
  const open = await db.listeningAttempt.findFirst({ where: { userId, lessonId: lesson.id, invalidatedAt: null, firstSubmittedAt: null }, orderBy: { startedAt: "desc" } });
  const attempt = open ?? (await db.listeningAttempt.create({ data: { userId, lessonId: lesson.id } }));
  return { lesson, attempt };
}

/** The student has pressed "I've read these words"; the questions unlock. Does nothing if already set. */
export async function markVocabSeen(userId: string, attemptId: string) {
  const now = new Date();
  await db.listeningAttempt.updateMany({ where: { id: attemptId, userId, vocabSeenAt: null }, data: { vocabSeenAt: now } });
  const attempt = await db.listeningAttempt.findFirst({ where: { id: attemptId, userId }, select: { lessonId: true } });
  if (attempt) await settleHomework(userId, { lessonId: attempt.lessonId }, now);
}

/** "Start test": the pacing checks count from now, by the server's clock. Only the first press counts. */
export async function beginListeningTest(userId: string, attemptId: string) {
  await db.listeningAttempt.updateMany({ where: { id: attemptId, userId, testStartedAt: null, firstSubmittedAt: null, invalidatedAt: null }, data: { testStartedAt: new Date() } });
}

async function ownAttempt(userId: string, attemptId: string) {
  const attempt = await db.listeningAttempt.findFirst({ where: { id: attemptId, userId }, include: { lesson: true } });
  if (!attempt) throw new Error("Attempt not found");
  return attempt;
}

/**
 * First submission: every question graded once; this alone gives the score and band. Like a passage's, it records
 * how the test ended and its telemetry; the button, the proctor and the beacon may all send it, and only the first
 * one to arrive is saved.
 */
export async function submitListening(userId: string, attemptId: string, given: Record<string, string>, meta: SubmissionMeta) {
  const attempt = await ownAttempt(userId, attemptId);
  if (attempt.firstSubmittedAt || attempt.invalidatedAt) return attempt;
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
  const band = estimateBand(firstCorrect, keys.length, "listening");
  const serverSeconds = attempt.testStartedAt ? Math.round((now.getTime() - attempt.testStartedAt.getTime()) / 1000) : null;
  const assessment = assessFirstTry({ kind: "listening", reason: meta.reason, telemetry: meta.telemetry, band, questionCount: keys.length, serverSeconds });
  // Only the first submission saves: the condition makes two arriving together safe.
  const saved = await db.listeningAttempt.updateMany({
    where: { id: attemptId, userId, firstSubmittedAt: null },
    data: {
      answers,
      firstSubmittedAt: now,
      firstCorrect,
      band,
      completedAt: allCorrect ? now : null,
      submissionReason: meta.reason,
      integrityFlagged: assessment.flagged,
      integrityReasons: assessment.reasons,
      integrityEvents: meta.events,
      telemetry: assessment.telemetry,
    },
  });
  if (!saved.count) return attempt;
  const content = { lessonId: attempt.lessonId };
  await recordFirstSubmit(userId, content, now, assessment.flagged);
  if (allCorrect) await settleHomework(userId, content, now);
  await markXpDirty(userId, now);
  return attempt;
}

/**
 * A red question can be checked again with a new answer; the right answer is never revealed. The attempt row is
 * locked while this runs: all of a lesson's answers live in one JSON column, so two checks at once would otherwise
 * overwrite each other.
 */
export async function retryListening(userId: string, attemptId: string, number: number, given: string): Promise<{ error?: string }> {
  const result = await db.$transaction(async (tx): Promise<{ error?: string; completed?: { lessonId: string; now: Date } }> => {
    await tx.$queryRaw`SELECT "id" FROM "ListeningAttempt" WHERE "id" = ${attemptId} FOR UPDATE`;
    const attempt = await tx.listeningAttempt.findFirst({ where: { id: attemptId, userId }, include: { lesson: { select: { questions: true } } } });
    if (!attempt) return { error: "Attempt not found." };
    if (attempt.invalidatedAt) return { error: "Your teacher asked you to take this lesson again." };
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
    await tx.listeningAttempt.update({ where: { id: attemptId }, data: { answers: next, ...(done && !attempt.completedAt ? { completedAt: now } : {}) } });
    return done && !attempt.completedAt ? { completed: { lessonId: attempt.lessonId, now } } : {};
  });
  if (result.completed) await settleHomework(userId, { lessonId: result.completed.lessonId }, result.completed.now);
  return { error: result.error };
}

export const vocabularyOf = (lesson: { vocabulary: unknown }) => lesson.vocabulary as VocabItem[];
