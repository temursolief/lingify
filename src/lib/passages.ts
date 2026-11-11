import "server-only";
import type { ErrorTag, Prisma } from "@/generated/prisma/client";
import { completeAssignments } from "./assignments";
import { db } from "./db";
import { answerKey, estimateBand, paragraphLetter, type QuestionGroup } from "./passage-format";

export type Evidence = { paragraph: number; start: number; end: number; text: string };

export type QuestionState = {
  number: number;
  answer: string;
  correct: boolean;
  firstCorrect: boolean;
  tries: number;
  evidence: Evidence | null;
  errorTag: ErrorTag | null;
  /** shown once the student has found the right answer themselves */
  explanation: string | null;
  /** answers already tried and marked wrong, so the student does not try them again */
  wrongAnswers: string[];
};

export type AttemptView = {
  id: string;
  submitted: boolean;
  completed: boolean;
  firstCorrect: number | null;
  total: number;
  band: number | null;
  questions: QuestionState[];
};

type History = { answer: string; correct: boolean; evidence: Evidence | null; at: string }[];

/** Passages a student may open: only the ones a teacher assigned to them. */
export function passageVisibleTo(userId: string): Prisma.PassageWhereInput {
  return { assignments: { some: { recipients: { some: { studentId: userId } } } } };
}

export async function latestAttempt(userId: string, passageId: string) {
  return db.passageAttempt.findFirst({ where: { userId, passageId }, orderBy: { startedAt: "desc" }, include: { answers: true } });
}

export function viewOf(attempt: NonNullable<Awaited<ReturnType<typeof latestAttempt>>>, groups: QuestionGroup[]): AttemptView {
  const keys = new Map(answerKey(groups).map((k) => [k.number, k]));
  return {
    id: attempt.id,
    submitted: !!attempt.firstSubmittedAt,
    completed: !!attempt.completedAt,
    firstCorrect: attempt.firstCorrect,
    total: attempt.total,
    band: attempt.band,
    questions: attempt.answers
      .sort((a, b) => a.number - b.number)
      .map((a) => ({
        number: a.number,
        answer: a.answer,
        correct: a.correct,
        firstCorrect: a.firstCorrect,
        tries: a.tries,
        evidence: (a.evidence as Evidence | null) ?? null,
        errorTag: a.errorTag,
        explanation: a.correct ? (keys.get(a.number)?.explanation ?? null) : null,
        wrongAnswers: (a.history as History).filter((h) => !h.correct).map((h) => h.answer),
      })),
  };
}

function evidenceOk(evidence: Evidence | null, expected: string | undefined) {
  if (!evidence || !expected) return null;
  return paragraphLetter(evidence.paragraph) === expected;
}

/** The exam-like first submission: every question is graded once; the score and band come from this alone. */
export async function submitFirst(userId: string, attemptId: string, answers: Record<number, string>, evidence: Record<number, Evidence>, seconds: number) {
  const attempt = await db.passageAttempt.findFirst({ where: { id: attemptId, userId }, include: { passage: { select: { groups: true } } } });
  if (!attempt) throw new Error("Attempt not found");
  // A second submit (a double tap, or the request sent again after a lost reply) changes nothing.
  if (attempt.firstSubmittedAt) return;
  const keys = answerKey(attempt.passage.groups as QuestionGroup[]);
  const now = new Date();
  const rows = keys.map((k) => {
    const given = (answers[k.number] ?? "").trim();
    const correct = !!given && k.check(given);
    const ev = evidence[k.number] ?? null;
    return {
      attemptId,
      number: k.number,
      type: k.type,
      answer: given,
      correct,
      firstCorrect: correct,
      tries: 1,
      evidence: ev ?? undefined,
      evidenceOk: evidenceOk(ev, k.evidence),
      history: [{ answer: given, correct, evidence: ev, at: now.toISOString() }],
    };
  });
  const firstCorrect = rows.filter((r) => r.correct).length;
  const allCorrect = firstCorrect === rows.length;
  try {
    await db.$transaction([
      db.questionAnswer.createMany({ data: rows }),
      db.passageAttempt.update({
        where: { id: attemptId },
        data: {
          firstSubmittedAt: now,
          firstSeconds: seconds,
          firstCorrect,
          band: estimateBand(firstCorrect, rows.length),
          ...(allCorrect ? { completedAt: now } : {}),
        },
      }),
      db.user.update({ where: { id: userId }, data: { lastActiveAt: now } }),
    ]);
  } catch (e) {
    // Two submits at the same moment: the other one saved the answers first (unique attempt + question number).
    if ((e as { code?: string }).code === "P2002") return;
    throw e;
  }
  if (allCorrect) await completeAssignments(userId, { passageId: attempt.passageId }, now);
}

export type RetryResult = { ok: true; correct: boolean; needsTag: boolean } | { ok: false; error: string };

/**
 * "Prove it": a red question can be checked again only with a new answer and a highlighted sentence from the
 * passage as proof. A question that turns green this way asks why it was missed before it locks.
 */
export async function retryQuestion(userId: string, attemptId: string, number: number, answer: string, evidence: Evidence | null): Promise<RetryResult> {
  const attempt = await db.passageAttempt.findFirst({ where: { id: attemptId, userId }, include: { passage: { select: { groups: true } } } });
  if (!attempt?.firstSubmittedAt) return { ok: false, error: "Submit your answers first." };
  const row = await db.questionAnswer.findUnique({ where: { attemptId_number: { attemptId, number } } });
  if (!row) return { ok: false, error: "Question not found." };
  if (row.correct) return { ok: false, error: "This question is already correct." };
  if (!evidence || !evidence.text.trim()) return { ok: false, error: "Highlight the sentence in the passage that proves your answer." };
  const given = answer.trim();
  if (!given) return { ok: false, error: "Write or choose an answer." };
  const history = row.history as History;
  if (history.some((h) => h.answer.toLowerCase() === given.toLowerCase())) return { ok: false, error: "You already tried this answer. Look at the passage again." };

  const key = answerKey(attempt.passage.groups as QuestionGroup[]).find((k) => k.number === number);
  if (!key) return { ok: false, error: "Question not found." };
  const correct = key.check(given);
  const now = new Date();
  await db.questionAnswer.update({
    where: { attemptId_number: { attemptId, number } },
    data: {
      answer: given,
      correct,
      tries: { increment: 1 },
      evidence,
      evidenceOk: evidenceOk(evidence, key.evidence),
      history: [...history, { answer: given, correct, evidence, at: now.toISOString() }],
    },
  });
  await db.user.update({ where: { id: userId }, data: { lastActiveAt: now } });
  return { ok: true, correct, needsTag: correct };
}

/** Root-cause tag for a corrected question; once every question is green and tagged, the passage is complete. */
export async function tagQuestion(userId: string, attemptId: string, number: number, tag: ErrorTag) {
  const attempt = await db.passageAttempt.findFirst({ where: { id: attemptId, userId }, include: { answers: true } });
  const row = attempt?.answers.find((a) => a.number === number);
  if (!attempt || !row || !row.correct || row.firstCorrect) throw new Error("Nothing to tag");
  await db.questionAnswer.update({ where: { attemptId_number: { attemptId, number } }, data: { errorTag: tag } });
  const done = attempt.answers.every((a) => a.correct && (a.firstCorrect || a.number === number || a.errorTag));
  if (done && !attempt.completedAt) {
    const now = new Date();
    await db.passageAttempt.update({ where: { id: attemptId }, data: { completedAt: now } });
    await completeAssignments(userId, { passageId: attempt.passageId }, now);
  }
}

export const ERROR_TAG_LABEL: Record<ErrorTag, { title: string; hint: string }> = {
  VOCAB: { title: "Vocab / Synonym", hint: "Didn't know a word or missed the paraphrase" },
  DISTRACTOR: { title: "Trap / Distractor", hint: "Fell for a word-match trick in the passage" },
  LOGIC: { title: "Logic / NG vs False", hint: "Over-inferred or misread the question logic" },
  CARELESS: { title: "Speed / Careless", hint: "Skimmed too fast or misread the prompt" },
};
