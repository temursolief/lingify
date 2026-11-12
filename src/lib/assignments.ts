import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { deckSummaries } from "./decks";
import { strictestPolicy, type ProctoringPolicy } from "./telemetry";

/** The homework a recipient row belongs to: one passage or one listening lesson. */
export type Content = { passageId: string } | { lessonId: string };

const assignmentOf = (content: Content): Prisma.AssignmentWhereInput => content;

/**
 * How strictly this student's first try is proctored: the strictest rule among the assignments that gave them this
 * passage or lesson. A retake a teacher required is never a practice run.
 */
export async function proctoringFor(userId: string, content: Content): Promise<ProctoringPolicy> {
  const [rows, retakes] = await Promise.all([
    db.assignmentRecipient.findMany({ where: { studentId: userId, assignment: assignmentOf(content) }, select: { assignment: { select: { proctoringPolicy: true } } } }),
    "passageId" in content
      ? db.passageAttempt.count({ where: { userId, passageId: content.passageId, invalidatedAt: { not: null } } })
      : db.listeningAttempt.count({ where: { userId, lessonId: content.lessonId, invalidatedAt: { not: null } } }),
  ]);
  const policy = strictestPolicy(rows.map((r) => r.assignment.proctoringPolicy));
  return retakes && policy === "NONE" ? "STRICT" : policy;
}

/** The first try is in: the homework shows "1st try submitted", and red for the teacher if it was flagged. */
export async function recordFirstSubmit(userId: string, content: Content, at: Date, flagged: boolean) {
  await db.assignmentRecipient.updateMany({
    where: { studentId: userId, assignment: assignmentOf(content), firstSubmitAt: null },
    data: { firstSubmitAt: at, ...(flagged ? { integrityFlagged: true } : {}) },
  });
}

/** A flag found after the first try (e.g. during "Prove it") marks the homework too. */
export async function flagHomework(userId: string, content: Content) {
  await db.assignmentRecipient.updateMany({ where: { studentId: userId, assignment: assignmentOf(content) }, data: { integrityFlagged: true } });
}

/** The latest attempt that still counts (not replaced by a retake) is complete. */
async function contentCompleted(userId: string, content: Content) {
  const where = { userId, invalidatedAt: null, completedAt: { not: null } };
  return "passageId" in content
    ? !!(await db.passageAttempt.findFirst({ where: { ...where, passageId: content.passageId }, select: { id: true } }))
    : !!(await db.listeningAttempt.findFirst({ where: { ...where, lessonId: content.lessonId }, select: { id: true } }));
}

/**
 * The vocabulary part of the homework. A lesson: its key words were read (the gate before the questions), or it has
 * none. A passage: nothing left to study today in its deck (new cards up to today's limit, learning and due cards),
 * or it has no deck. Measured "today" on purpose: a 100-card deck takes days at 20 new cards a day.
 */
async function vocabCleared(userId: string, content: Content) {
  if ("lessonId" in content) {
    const [lesson, read] = await Promise.all([
      db.listeningLesson.findUnique({ where: { id: content.lessonId }, select: { wordCount: true } }),
      db.listeningAttempt.findFirst({ where: { userId, lessonId: content.lessonId, vocabSeenAt: { not: null } }, select: { id: true } }),
    ]);
    return !lesson?.wordCount || !!read;
  }
  const deck = await db.deck.findUnique({ where: { passageId: content.passageId }, select: { id: true, archivedAt: true } });
  if (!deck || deck.archivedAt) return true;
  const c = (await deckSummaries(userId, [deck.id])).get(deck.id);
  return !c || c.new + c.learn + c.due === 0;
}

/**
 * Brings this student's homework for one passage or lesson up to date: stamps the vocabulary part once it is met,
 * then marks the homework done when the work is complete and, where the assignment asks for it, the vocabulary too.
 * Safe to call any number of times.
 */
export async function settleHomework(userId: string, content: Content, now = new Date()) {
  const open = await db.assignmentRecipient.findMany({
    where: { studentId: userId, assignment: assignmentOf(content), OR: [{ completedAt: null }, { vocabCompletedAt: null }] },
    select: { assignmentId: true },
  });
  if (!open.length) return;
  const [done, vocab] = await Promise.all([contentCompleted(userId, content), vocabCleared(userId, content)]);
  if (vocab) {
    await db.assignmentRecipient.updateMany({ where: { studentId: userId, assignment: assignmentOf(content), vocabCompletedAt: null }, data: { vocabCompletedAt: now } });
  }
  if (done) {
    await db.assignmentRecipient.updateMany({
      where: {
        studentId: userId,
        completedAt: null,
        assignment: assignmentOf(content),
        ...(vocab ? {} : { OR: [{ assignment: { requireVocabFirst: false } }, { vocabCompletedAt: { not: null } }] }),
      },
      data: { completedAt: now },
    });
  }
}

/** After flashcard reviews: homework whose passage deck was studied may now have its vocabulary part met. */
export async function settleAfterReviews(userId: string, passageIds: string[]) {
  if (!passageIds.length) return;
  const waiting = await db.assignmentRecipient.findMany({
    where: { studentId: userId, vocabCompletedAt: null, assignment: { passageId: { in: passageIds } } },
    select: { assignment: { select: { passageId: true } } },
  });
  for (const passageId of new Set(waiting.map((w) => w.assignment.passageId!))) await settleHomework(userId, { passageId });
}
