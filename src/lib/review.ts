import "server-only";
import { pickContext } from "./contexts";
import { db } from "./db";
import { isCorrect, resultFor, reviewOutcome, type ReviewResult } from "./review-grade";
import { recordSnapshot } from "./vocab";

/**
 * Grades one review and saves the new schedule. `at` is when the student answered: the time of the request
 * online, or the time recorded on the laptop for reviews done offline and synced later.
 */
export async function applyReview(userId: string, lemma: string, answer: string, at = new Date()): Promise<ReviewResult | null> {
  const state = await db.lemmaState.findUnique({ where: { userId_lemma: { userId, lemma } } });
  if (!state || state.status === "SEEN") return null;

  const expected = pickContext(state).word;
  const correct = isCorrect(answer, expected, lemma);
  const next = reviewOutcome({ ...state, status: state.status }, correct, at);

  await db.$transaction([
    db.lemmaState.update({
      where: { userId_lemma: { userId, lemma } },
      data: {
        srsInterval: next.srsInterval,
        srsEase: next.srsEase,
        srsStreak: next.srsStreak,
        srsReviews: next.srsReviews,
        srsLapses: next.srsLapses,
        srsDue: next.srsDue,
        ...(next.graduated ? { status: "KNOWN" as const, knownAt: at } : {}),
        ...(next.forgotten ? { status: "LEARNING" as const, knownAt: null } : {}),
      },
    }),
    db.exerciseAttempt.create({ data: { userId, kind: "REVIEW", itemKey: lemma, correct, answeredAt: at } }),
    db.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }),
  ]);
  if (next.graduated || next.forgotten) await recordSnapshot(userId);
  return resultFor(next, correct, expected, at);
}
