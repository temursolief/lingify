/**
 * The game rules, as pure functions over a list of things the student did. XP, levels, streaks, shields, quests and
 * penalties are all worked out from first tries, proofs, tags, timed card reviews, finished homework and missed days
 * (the XpDay rollup in gamification.ts keeps the per-day result), so a flagged or retaken first try loses its XP
 * automatically and nothing can be counted twice.
 *
 * Reward real effort, not speed: right answers at the first try, proofs found, explaining a miss, unhurried card
 * reviews. Nothing for flagged attempts, cards rushed through, or a passage practised again. Values are small on
 * purpose, so a stage takes weeks of steady work, and they are points with decimals: a 13-question passage is
 * worth at most 39 points, a flashcard a fifth of a point.
 */
import { addDays, dayKey } from "./time";

export const XP = {
  /** each answer right at the first try: the most any single answer earns */
  correct: 3,
  /** a red answer fixed with its proof in the paragraph the teacher marked */
  proof: 2,
  /** fixed, but the proof was in another paragraph */
  proofElsewhere: 1,
  tag: 0.5,
  card: 0.2,
  /** bonus for finishing a piece of homework, words included */
  homework: 3,
} as const;

/** What a missed duty costs. A shield covers the streak penalty only: words are owed every day. */
export const XP_LOSS = {
  /** a day with no real action, and no shield to spend */
  idleDay: 10,
  /** a day with no flashcards reviewed */
  noWords: 3,
  /** a test that ended because the student left it (tab, window or fullscreen) */
  leftTest: 5,
} as const;

/** Penalties for a stretch of idle days stop after this many: someone who has gone is not punished forever. */
export const IDLE_CAP_DAYS = 7;

/** XP is kept in tenths of a point in XpDay (an integer column); everything else works in points. */
export const toTenths = (points: number) => Math.round(points * 10);
export const fromTenths = (tenths: number) => tenths / 10;

/** Points as people read them: one decimal at most, no trailing ".0" ("12", "12.4", "−3"). */
export function fmtXp(points: number): string {
  const v = Math.round(points * 10) / 10;
  return (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** A card shown for less than this was clicked through, not studied: it counts for the streak but earns nothing. */
export const UNHURRIED_MS = 2_000;

export type XpKind = "first" | "proof" | "tag" | "card" | "homework" | "left";

/**
 * One thing the student did. `xp` 0 = it counts for streaks and quests but earns nothing (flagged, rushed, repeated);
 * "left" is a test the student walked out of, and is the only event with negative XP.
 */
export type XpEvent = { kind: XpKind; at: Date; xp: number };

export const totalXp = (events: XpEvent[]) => events.reduce((n, e) => n + e.xp, 0);

export const xpSince = (events: XpEvent[], since: Date) => events.reduce((n, e) => (e.at >= since ? n + e.xp : n), 0);

/** Level L starts at 40·L·(L−1) XP: 0, 80, 240, 480… so early levels come quickly and later ones take steady work. */
export function levelOf(xp: number): { level: number; from: number; to: number } {
  let level = 1;
  while (40 * (level + 1) * level <= xp) level++;
  return { level, from: 40 * level * (level - 1), to: 40 * (level + 1) * level };
}

export type DayCounts = { first: number; proofs: number; cards: number };

export const QUEST_GOALS = { proofs: 2, cards: 20, first: 1 } as const;

/** Cards in a day that count as a real day of study on their own. */
export const REAL_DAY_CARDS = 10;

/** One real action a day keeps the streak: 10 cards, one proof, or a first try. */
export const isRealDay = (d: DayCounts) => d.cards >= REAL_DAY_CARDS || d.proofs >= 1 || d.first >= 1;

export const allQuestsDone = (d: DayCounts) => d.proofs >= QUEST_GOALS.proofs && d.cards >= QUEST_GOALS.cards && d.first >= QUEST_GOALS.first;

/** What the student did on each calendar day, keyed "YYYY-MM-DD" by `dayOf`. */
export function countsByDay(events: XpEvent[], dayOf: (d: Date) => Date): Map<string, DayCounts> {
  const days = new Map<string, DayCounts>();
  for (const e of events) {
    const key = dayKey(dayOf(e.at));
    const d = days.get(key) ?? { first: 0, proofs: 0, cards: 0 };
    if (e.kind === "first") d.first++;
    else if (e.kind === "proof") d.proofs++;
    else if (e.kind === "card") d.cards++;
    days.set(key, d);
  }
  return days;
}

/** What the student did and earned on one day: the row stored in XpDay. */
export type DayTotals = DayCounts & { xp: number };

/** Like `countsByDay`, with the XP earned each day: what the XpDay rollup stores, one entry per active day. */
export function totalsByDay(events: XpEvent[], dayOf: (d: Date) => Date): Map<string, DayTotals> {
  const days = new Map<string, DayTotals>();
  for (const e of events) {
    const key = dayKey(dayOf(e.at));
    const d = days.get(key) ?? { xp: 0, first: 0, proofs: 0, cards: 0 };
    d.xp += e.xp;
    if (e.kind === "first") d.first++;
    else if (e.kind === "proof") d.proofs++;
    else if (e.kind === "card") d.cards++;
    days.set(key, d);
  }
  return days;
}

export const MAX_SHIELDS = 2;

/**
 * The streak, walking forward day by day. Finishing all three quests on a day earns a shield (at most two); a day
 * with no real action uses a shield instead of breaking the streak. Today never breaks it: there is still time.
 */
export function streakOf(days: Map<string, DayCounts>, today: Date): { streak: number; best: number; shields: number; todayDone: boolean } {
  const keys = [...days.keys()].sort();
  const todayKey = dayKey(today);
  let streak = 0;
  let best = 0;
  let shields = 0;
  if (!keys.length) return { streak, best, shields, todayDone: false };
  for (let cursor = new Date(`${keys[0]}T00:00:00.000Z`); dayKey(cursor) <= todayKey; cursor = addDays(cursor, 1)) {
    const key = dayKey(cursor);
    const d = days.get(key);
    if (d && isRealDay(d)) {
      streak++;
      best = Math.max(best, streak);
      if (allQuestsDone(d)) shields = Math.min(MAX_SHIELDS, shields + 1);
    } else if (key !== todayKey) {
      if (streak > 0 && shields > 0) shields--;
      else streak = 0;
    }
  }
  const t = days.get(todayKey);
  return { streak, best, shields, todayDone: !!t && isRealDay(t) };
}

/**
 * What each past day cost, in points (positive numbers), keyed "YYYY-MM-DD": the same day-by-day walk as the streak.
 * A day with no real action costs `idleDay` unless a shield is spent on it; a day with no cards reviewed costs
 * `noWords`. Nothing is charged before the student's first day or for today (there is still time), and after
 * `IDLE_CAP_DAYS` idle days in a row it stops.
 */
export function missedDayPenalties(days: Map<string, DayCounts>, today: Date): Map<string, number> {
  const out = new Map<string, number>();
  const keys = [...days.keys()].sort();
  if (!keys.length) return out;
  const todayKey = dayKey(today);
  let streak = 0;
  let shields = 0;
  let idleRun = 0;
  for (let cursor = new Date(`${keys[0]}T00:00:00.000Z`); dayKey(cursor) < todayKey; cursor = addDays(cursor, 1)) {
    const key = dayKey(cursor);
    const d = days.get(key);
    let cost = 0;
    if (d && isRealDay(d)) {
      streak++;
      idleRun = 0;
      if (allQuestsDone(d)) shields = Math.min(MAX_SHIELDS, shields + 1);
    } else {
      idleRun++;
      if (streak > 0 && shields > 0) shields--;
      else {
        streak = 0;
        if (idleRun <= IDLE_CAP_DAYS) cost += XP_LOSS.idleDay;
      }
    }
    if (!(d && d.cards > 0) && idleRun <= IDLE_CAP_DAYS) cost += XP_LOSS.noWords;
    if (cost) out.set(key, cost);
  }
  return out;
}

export type Quest = { key: keyof typeof QUEST_GOALS; title: string; count: number; goal: number; done: boolean };

export function questsFor(today: DayCounts | undefined): Quest[] {
  const d = today ?? { first: 0, proofs: 0, cards: 0 };
  const q = (key: keyof typeof QUEST_GOALS, title: string): Quest => ({ key, title, count: Math.min(d[key], QUEST_GOALS[key]), goal: QUEST_GOALS[key], done: d[key] >= QUEST_GOALS[key] });
  return [q("proofs", `Prove ${QUEST_GOALS.proofs} answers`), q("cards", `Review ${QUEST_GOALS.cards} cards`), q("first", "Finish a first try")];
}

/** The class goal for a week: 150 XP per student (a steady student earns about that), rounded to a friendly number. */
export const classGoal = (students: number) => Math.max(300, Math.round((students * 150) / 50) * 50);
