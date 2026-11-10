/**
 * Anki's SM-2 scheduler with Anki's default deck options, except that no interval may exceed 20 days.
 * Pure functions, shared by the server and the offline app so both give the same next due date.
 *
 * Defaults (Anki "Default" preset): learning steps 1m 10m, graduating interval 1 day, easy interval 4 days,
 * starting ease 250%, relearning step 10m, minimum ease 130%, hard ×1.2, easy bonus ×1.3, 20 new cards a day.
 */

export type Queue = "NEW" | "LEARNING" | "REVIEW" | "RELEARNING";
export type Rating = 1 | 2 | 3 | 4;
export const RATING_LABEL: Record<Rating, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

export type Schedule = { queue: Queue; due: Date; interval: number; ease: number; reps: number; lapses: number; step: number };

export const OPTIONS = {
  learnSteps: [1, 10],
  relearnSteps: [10],
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2500,
  minEase: 1300,
  hardFactor: 1.2,
  easyBonus: 1.3,
  /** the one change from Anki's defaults: cards come back at least every 20 days */
  maxInterval: 20,
  newPerDay: 20,
  reviewsPerDay: 200,
  /** learning cards due within this many minutes may be shown early when nothing else is due, like Anki */
  learnAheadMinutes: 20,
};

const MIN = 60_000;
const DAY = 86_400_000;

export const newSchedule = (now: Date, position = 0): Schedule => ({
  queue: "NEW",
  due: new Date(now.getTime() + position),
  interval: 0,
  ease: OPTIONS.startingEase,
  reps: 0,
  lapses: 0,
  step: 0,
});

const clampInterval = (days: number) => Math.max(1, Math.min(OPTIONS.maxInterval, Math.round(days)));
const inMinutes = (now: Date, minutes: number) => new Date(now.getTime() + minutes * MIN);
const inDays = (now: Date, days: number) => new Date(now.getTime() + days * DAY);

/** Delay for "Hard" on a learning step: Anki uses the average of this and the next step on the first step. */
function hardDelay(steps: number[], step: number) {
  if (step === 0 && steps.length > 1) return (steps[0] + steps[1]) / 2;
  return steps[step] ?? steps[steps.length - 1];
}

function graduate(s: Schedule, now: Date, interval: number): Schedule {
  const ivl = clampInterval(interval);
  return { ...s, queue: "REVIEW", interval: ivl, step: 0, due: inDays(now, ivl) };
}

export function answer(card: Schedule, rating: Rating, now: Date): Schedule {
  const s: Schedule = { ...card, reps: card.reps + 1 };

  if (s.queue === "NEW" || s.queue === "LEARNING") {
    const steps = OPTIONS.learnSteps;
    const step = s.queue === "NEW" ? 0 : s.step;
    switch (rating) {
      case 1:
        return { ...s, queue: "LEARNING", step: 0, due: inMinutes(now, steps[0]) };
      case 2:
        return { ...s, queue: "LEARNING", step, due: inMinutes(now, hardDelay(steps, step)) };
      case 3:
        return step + 1 >= steps.length
          ? graduate(s, now, OPTIONS.graduatingInterval)
          : { ...s, queue: "LEARNING", step: step + 1, due: inMinutes(now, steps[step + 1]) };
      case 4:
        return graduate(s, now, OPTIONS.easyInterval);
    }
  }

  if (s.queue === "RELEARNING") {
    const steps = OPTIONS.relearnSteps;
    switch (rating) {
      case 1:
        return { ...s, step: 0, due: inMinutes(now, steps[0]) };
      case 2:
        return { ...s, due: inMinutes(now, hardDelay(steps, s.step)) };
      case 3:
        return s.step + 1 >= steps.length ? graduate(s, now, s.interval) : { ...s, step: s.step + 1, due: inMinutes(now, steps[s.step + 1]) };
      case 4:
        return graduate(s, now, s.interval + 1);
    }
  }

  // REVIEW
  const ivl = Math.max(1, s.interval);
  const ease = s.ease / 1000;
  const hard = clampInterval(Math.max(ivl + 1, ivl * OPTIONS.hardFactor));
  const good = clampInterval(Math.max(hard + 1, ivl * ease));
  const easy = clampInterval(Math.max(good + 1, ivl * ease * OPTIONS.easyBonus));
  switch (rating) {
    case 1:
      return {
        ...s,
        queue: "RELEARNING",
        lapses: s.lapses + 1,
        ease: Math.max(OPTIONS.minEase, s.ease - 200),
        interval: 1,
        step: 0,
        due: inMinutes(now, OPTIONS.relearnSteps[0]),
      };
    case 2:
      return { ...s, ease: Math.max(OPTIONS.minEase, s.ease - 150), interval: hard, due: inDays(now, hard) };
    case 3:
      return { ...s, interval: good, due: inDays(now, good) };
    case 4:
      return { ...s, ease: s.ease + 150, interval: easy, due: inDays(now, easy) };
  }
}

/** The label Anki shows above each answer button: "<1m", "6m", "1d", "4d"… */
export function intervalLabel(card: Schedule, rating: Rating, now: Date) {
  const ms = answer(card, rating, now).due.getTime() - now.getTime();
  if (ms < MIN) return "<1m";
  if (ms < 60 * MIN) return `${Math.round(ms / MIN)}m`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}h`;
  return `${Math.round(ms / DAY)}d`;
}

export const isLearning = (q: Queue) => q === "LEARNING" || q === "RELEARNING";

/**
 * Which card to show next, from cards already loaded for a deck: learning cards that are due first,
 * then reviews, then new cards, then learning cards due within the learn-ahead window. Mirrors Anki's order.
 */
export function pickNext<T extends { schedule: Schedule }>(cards: T[], now: Date, newLeft: number, reviewsLeft: number, dayEnd = endOfDay(now)): T | null {
  const t = now.getTime();
  const due = (c: T) => c.schedule.due.getTime();
  const learningNow = cards.filter((c) => isLearning(c.schedule.queue) && due(c) <= t).sort((a, b) => due(a) - due(b));
  if (learningNow.length) return learningNow[0];
  const reviews = cards.filter((c) => c.schedule.queue === "REVIEW" && due(c) <= dayEnd).sort((a, b) => due(a) - due(b));
  if (reviews.length && reviewsLeft > 0) return reviews[0];
  const fresh = cards.filter((c) => c.schedule.queue === "NEW").sort((a, b) => due(a) - due(b));
  if (fresh.length && newLeft > 0) return fresh[0];
  const ahead = cards
    .filter((c) => isLearning(c.schedule.queue) && due(c) <= t + OPTIONS.learnAheadMinutes * MIN)
    .sort((a, b) => due(a) - due(b));
  return ahead[0] ?? null;
}

/**
 * Reviews count as due for the whole day they fall on, like Anki. This is the day of the device running the code;
 * a caller that knows the school's day (the server does) passes its own `dayEnd` to `pickNext` and `deckCounts`.
 */
export function endOfDay(now: Date) {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** The three numbers on Anki's deck list: New (blue), Learn (red), Due (green). */
export function deckCounts(schedules: Schedule[], now: Date, newLeft: number, reviewsLeft: number, dayEnd = endOfDay(now)) {
  const t = now.getTime();
  return {
    new: Math.min(newLeft, schedules.filter((s) => s.queue === "NEW").length),
    learn: schedules.filter((s) => isLearning(s.queue) && s.due.getTime() <= t + OPTIONS.learnAheadMinutes * MIN).length,
    due: Math.min(reviewsLeft, schedules.filter((s) => s.queue === "REVIEW" && s.due.getTime() <= dayEnd).length),
  };
}
