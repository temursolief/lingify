/** A word moves from LEARNING to KNOWN after this many successful spaced retrievals in a row. */
export const GRADUATE_STREAK = 5;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const RELEARN_MINUTES = 10;

export type SrsState = {
  srsInterval: number;
  srsEase: number;
  srsStreak: number;
  srsReviews: number;
  srsLapses: number;
};

export type SrsResult = SrsState & { srsDue: Date | null; graduated: boolean };

export function firstDue(now: Date): Date {
  return new Date(now.getTime() + 24 * 3_600_000);
}

export function schedule(state: SrsState, correct: boolean, now: Date): SrsResult {
  const reviews = state.srsReviews + 1;
  if (!correct) {
    return {
      srsInterval: 0,
      srsEase: Math.max(MIN_EASE, state.srsEase - 0.2),
      srsStreak: 0,
      srsReviews: reviews,
      srsLapses: state.srsLapses + 1,
      srsDue: new Date(now.getTime() + RELEARN_MINUTES * 60_000),
      graduated: false,
    };
  }
  const streak = state.srsStreak + 1;
  const ease = Math.min(MAX_EASE, state.srsEase + 0.1);
  const interval = streak === 1 ? 1 : streak === 2 ? 3 : Math.max(state.srsInterval + 1, Math.round(state.srsInterval * ease));
  const graduated = streak >= GRADUATE_STREAK;
  return {
    srsInterval: interval,
    srsEase: ease,
    srsStreak: streak,
    srsReviews: reviews,
    srsLapses: state.srsLapses,
    srsDue: graduated ? null : new Date(now.getTime() + interval * 86_400_000),
    graduated,
  };
}
