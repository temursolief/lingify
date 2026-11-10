import { MAINTENANCE_FIRST_DAYS, maintain, schedule, type SrsState } from "./srs";

/** Shared by the server and the offline app, so a review graded offline gives the same result once synced. */

export type ReviewResult = { correct: boolean; expected: string; graduated: boolean; forgotten: boolean; nextInDays: number | null };

export type GradableState = SrsState & { status: "LEARNING" | "KNOWN" };

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[’‘]/g, "'");
}

export function isCorrect(answer: string, expected: string, lemma: string) {
  const given = normalize(answer);
  return given === normalize(expected) || given === lemma;
}

/** The next scheduling state for one review, including the month-long gap before a new word's first check-up. */
export function reviewOutcome(state: GradableState, correct: boolean, now: Date) {
  const checkup = state.status === "KNOWN";
  const next = checkup ? maintain(state, correct, now) : { ...schedule(state, correct, now), forgotten: false };
  const srsDue = next.graduated ? new Date(now.getTime() + MAINTENANCE_FIRST_DAYS * 86_400_000) : next.srsDue;
  const srsInterval = next.graduated ? MAINTENANCE_FIRST_DAYS : next.srsInterval;
  return { ...next, srsInterval, srsDue };
}

export function resultFor(outcome: ReturnType<typeof reviewOutcome>, correct: boolean, expected: string, now: Date): ReviewResult {
  return {
    correct,
    expected,
    graduated: outcome.graduated,
    forgotten: outcome.forgotten,
    nextInDays: outcome.srsDue ? Math.round((outcome.srsDue.getTime() - now.getTime()) / 86_400_000) : null,
  };
}
