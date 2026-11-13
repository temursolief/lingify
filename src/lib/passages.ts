import "server-only";
import type { ErrorTag, Prisma } from "@/generated/prisma/client";
import { flagHomework, recordFirstSubmit, settleHomework } from "./assignments";
import { db } from "./db";
import { markXpDirty } from "./xp-store";
import { answerKey, estimateBand, paragraphLetter, type QuestionGroup } from "./passage-format";
import { assessFirstTry, locatingMismatch, type SubmissionMeta, type SubmissionReason } from "./telemetry";

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
  /** the student pressed "Start test" (the timer runs from then, by the server's clock) */
  started: boolean;
  /** seconds since "Start test" when this view was made; null before it */
  elapsedSec: number | null;
  submitted: boolean;
  /** how the first try ended: NORMAL, TIMER_EXPIRED, or the student left the test (TAB_HIDDEN, …) */
  reason: SubmissionReason;
  completed: boolean;
  firstCorrect: number | null;
  total: number;
  band: number | null;
  questions: QuestionState[];
};

type History = { answer: string; correct: boolean; evidence: Evidence | null; at: string }[];

/** Passages a student may open: only the ones a teacher assigned to them, and not archived. */
export function passageVisibleTo(userId: string): Prisma.PassageWhereInput {
  return { archivedAt: null, assignments: { some: { recipients: { some: { studentId: userId } } } } };
}

/** The attempt that counts: the newest one a teacher has not replaced with a retake. */
export async function latestAttempt(userId: string, passageId: string) {
  return db.passageAttempt.findFirst({ where: { userId, passageId, invalidatedAt: null }, orderBy: { startedAt: "desc" }, include: { answers: true } });
}

export function viewOf(attempt: NonNullable<Awaited<ReturnType<typeof latestAttempt>>>, groups: QuestionGroup[]): AttemptView {
  const keys = new Map(answerKey(groups).map((k) => [k.number, k]));
  return {
    id: attempt.id,
    started: !!attempt.testStartedAt,
    elapsedSec: attempt.testStartedAt && !attempt.firstSubmittedAt ? Math.max(0, Math.round((Date.now() - attempt.testStartedAt.getTime()) / 1000)) : null,
    submitted: !!attempt.firstSubmittedAt,
    reason: attempt.submissionReason,
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

/** "Start test": the timer and the pacing checks count from now, by the server's clock. Only the first press counts. */
export async function beginTest(userId: string, attemptId: string) {
  await db.passageAttempt.updateMany({ where: { id: attemptId, userId, testStartedAt: null, firstSubmittedAt: null, invalidatedAt: null }, data: { testStartedAt: new Date() } });
}

/**
 * The exam-like first submission: every question is graded once; the score and band come from this alone. It also
 * records how the test ended and the browser's telemetry, and flags the attempt for the teacher if the pace or a
 * tab switch says so. Sent by the Submit button, the timer, the proctor when the student leaves the test, or the
 * beacon when the tab closes: whichever arrives first wins and the others change nothing.
 */
export async function submitFirst(
  userId: string,
  attemptId: string,
  answers: Record<number, string>,
  evidence: Record<number, Evidence>,
  seconds: number,
  meta: SubmissionMeta,
) {
  const attempt = await db.passageAttempt.findFirst({ where: { id: attemptId, userId }, include: { passage: { select: { groups: true } } } });
  if (!attempt) throw new Error("Attempt not found");
  // A second submit (a double tap, the beacon after the action, or the request sent again after a lost reply) changes nothing.
  if (attempt.firstSubmittedAt || attempt.invalidatedAt) return;
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
  const band = estimateBand(firstCorrect, rows.length);
  const serverSeconds = attempt.testStartedAt ? Math.round((now.getTime() - attempt.testStartedAt.getTime()) / 1000) : null;
  const assessment = assessFirstTry({ kind: "reading", reason: meta.reason, telemetry: meta.telemetry, band, questionCount: rows.length, serverSeconds });
  try {
    await db.$transaction([
      db.questionAnswer.createMany({ data: rows }),
      db.passageAttempt.update({
        where: { id: attemptId },
        data: {
          firstSubmittedAt: now,
          firstSeconds: serverSeconds ?? seconds,
          firstCorrect,
          band,
          submissionReason: meta.reason,
          integrityFlagged: assessment.flagged,
          integrityReasons: assessment.reasons,
          integrityEvents: meta.events,
          telemetry: assessment.telemetry,
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
  const content = { passageId: attempt.passageId };
  await recordFirstSubmit(userId, content, now, assessment.flagged);
  if (allCorrect) await settleHomework(userId, content, now);
  await markXpDirty(userId, now);
}

export type RetryResult = { ok: true; correct: boolean; needsTag: boolean } | { ok: false; error: string };

/** Locks one attempt for the rest of a transaction, so two requests on it (a double click, two tabs) take turns. */
async function lockAttempt(tx: Prisma.TransactionClient, attemptId: string) {
  await tx.$queryRaw`SELECT "id" FROM "PassageAttempt" WHERE "id" = ${attemptId} FOR UPDATE`;
}

/** Every "Prove it" highlight after the first try, in order, checked against the teacher's evidence paragraphs. */
function proofSequence(answers: { number: number; history: Prisma.JsonValue }[], groups: QuestionGroup[]) {
  const expected = new Map(answerKey(groups).map((k) => [k.number, k.evidence]));
  return answers
    .flatMap((a) => (a.history as History).slice(1).map((h) => ({ at: h.at, ok: evidenceOk(h.evidence, expected.get(a.number)) })))
    .sort((x, y) => x.at.localeCompare(y.at))
    .map((p) => p.ok);
}

/**
 * "Prove it": a red question can be checked again only with a new answer and a highlighted sentence from the
 * passage as proof. A question that turns green this way asks why it was missed before it locks. The attempt is
 * locked while this runs, so two quick checks can never lose a try or both pass the "already tried" rule.
 */
export async function retryQuestion(userId: string, attemptId: string, number: number, answer: string, evidence: Evidence | null): Promise<RetryResult> {
  const given = answer.trim();
  const result = await db.$transaction(async (tx): Promise<RetryResult & { mismatch?: boolean; passageId?: string; firstAt?: Date }> => {
    await lockAttempt(tx, attemptId);
    const attempt = await tx.passageAttempt.findFirst({ where: { id: attemptId, userId }, include: { passage: { select: { groups: true } }, answers: true } });
    if (!attempt?.firstSubmittedAt) return { ok: false, error: "Submit your answers first." };
    if (attempt.invalidatedAt) return { ok: false, error: "Your teacher asked you to take this passage again." };
    const row = attempt.answers.find((a) => a.number === number);
    if (!row) return { ok: false, error: "Question not found." };
    if (row.correct) return { ok: false, error: "This question is already correct." };
    if (!evidence || !evidence.text.trim()) return { ok: false, error: "Highlight the sentence in the passage that proves your answer." };
    if (!given) return { ok: false, error: "Write or choose an answer." };
    const history = row.history as History;
    if (history.some((h) => h.answer.toLowerCase() === given.toLowerCase())) return { ok: false, error: "You already tried this answer. Look at the passage again." };

    const groups = attempt.passage.groups as QuestionGroup[];
    const key = answerKey(groups).find((k) => k.number === number);
    if (!key) return { ok: false, error: "Question not found." };
    const correct = key.check(given);
    const now = new Date();
    const nextHistory = [...history, { answer: given, correct, evidence, at: now.toISOString() }];
    await tx.questionAnswer.update({
      where: { attemptId_number: { attemptId, number } },
      data: { answer: given, correct, tries: { increment: 1 }, evidence, evidenceOk: evidenceOk(evidence, key.evidence), history: nextHistory },
    });
    // Wrong paragraph again and again while the first-try answers were right: those answers did not come from the passage.
    const answers = attempt.answers.map((a) => (a.number === number ? { ...a, history: nextHistory } : a));
    const mismatch = !attempt.integrityReasons.includes("LOCATING_SKILL_MISMATCH") && locatingMismatch(proofSequence(answers, groups));
    if (mismatch) {
      await tx.passageAttempt.update({ where: { id: attemptId }, data: { integrityFlagged: true, integrityReasons: { push: "LOCATING_SKILL_MISMATCH" } } });
    }
    await tx.user.update({ where: { id: userId }, data: { lastActiveAt: now } });
    return { ok: true, correct, needsTag: correct, mismatch, passageId: attempt.passageId, firstAt: attempt.firstSubmittedAt };
  });
  if ("mismatch" in result && result.mismatch && result.passageId) await flagHomework(userId, { passageId: result.passageId });
  // A proof earns XP, and a new flag takes back the whole attempt's XP (from its first try, possibly days ago).
  if (result.ok && (result.correct || result.mismatch)) await markXpDirty(userId, result.mismatch && result.firstAt ? result.firstAt : new Date());
  return result.ok ? { ok: true, correct: result.correct, needsTag: result.needsTag } : { ok: false, error: result.error };
}

/** Root-cause tag for a corrected question; once every question is green and tagged, the passage is complete. */
export async function tagQuestion(userId: string, attemptId: string, number: number, tag: ErrorTag) {
  const { completed, fixedAt } = await db.$transaction(async (tx) => {
    await lockAttempt(tx, attemptId);
    const attempt = await tx.passageAttempt.findFirst({ where: { id: attemptId, userId, invalidatedAt: null }, include: { answers: true } });
    const row = attempt?.answers.find((a) => a.number === number);
    if (!attempt || !row || !row.correct || row.firstCorrect) throw new Error("Nothing to tag");
    await tx.questionAnswer.update({ where: { attemptId_number: { attemptId, number } }, data: { errorTag: tag } });
    // The tag's XP is dated to the fix it explains, which may be an earlier day.
    const fixedAt = (row.history as History).findLast((h) => h.correct)?.at;
    const done = attempt.answers.every((a) => a.correct && (a.firstCorrect || a.number === number || a.errorTag));
    if (!done || attempt.completedAt) return { completed: null, fixedAt };
    const now = new Date();
    await tx.passageAttempt.update({ where: { id: attemptId }, data: { completedAt: now } });
    return { completed: { passageId: attempt.passageId, now }, fixedAt };
  });
  if (completed) await settleHomework(userId, { passageId: completed.passageId }, completed.now);
  await markXpDirty(userId, fixedAt ? new Date(fixedAt) : new Date(0));
}

export const ERROR_TAG_LABEL: Record<ErrorTag, { title: string; hint: string }> = {
  VOCAB: { title: "Vocab / Synonym", hint: "Didn't know a word or missed the paraphrase" },
  DISTRACTOR: { title: "Trap / Distractor", hint: "Fell for a word-match trick in the passage" },
  LOGIC: { title: "Logic / NG vs False", hint: "Over-inferred or misread the question logic" },
  CARELESS: { title: "Speed / Careless", hint: "Skimmed too fast or misread the prompt" },
};
