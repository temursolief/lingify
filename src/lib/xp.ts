/**
 * The game rules, as pure functions over a list of things the student did. Nothing here is stored: XP, levels,
 * streaks, shields and quests are all worked out from first tries, proofs, tags, timed card reviews and finished
 * homework, so a flagged or retaken first try loses its XP automatically and nothing can be counted twice.
 *
 * Reward real effort, not speed: first tries, proofs found, explaining a miss, unhurried card reviews. Nothing for
 * flagged attempts, cards rushed through, or a passage practised again.
 */
import { addDays, dayKey } from "./time";

export const XP = {
  firstTry: 30,
  /** a red answer fixed with its proof in the paragraph the teacher marked */
  proof: 20,
  /** fixed, but the proof was in another paragraph */
  proofElsewhere: 10,
  tag: 5,
  card: 2,
  homework: 50,
} as const;

/** A card shown for less than this was clicked through, not studied: it counts for the streak but earns nothing. */
export const UNHURRIED_MS = 2_000;

export type XpKind = "first" | "proof" | "tag" | "card" | "homework";

/** One thing the student did. `xp` 0 = it counts for streaks and quests but earns nothing (flagged, rushed, repeated). */
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

/** One real action a day keeps the streak: 10 cards, one proof, or a first try. */
export const isRealDay = (d: DayCounts) => d.cards >= 10 || d.proofs >= 1 || d.first >= 1;

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

export type Quest = { key: keyof typeof QUEST_GOALS; title: string; count: number; goal: number; done: boolean };

export function questsFor(today: DayCounts | undefined): Quest[] {
  const d = today ?? { first: 0, proofs: 0, cards: 0 };
  const q = (key: keyof typeof QUEST_GOALS, title: string): Quest => ({ key, title, count: Math.min(d[key], QUEST_GOALS[key]), goal: QUEST_GOALS[key], done: d[key] >= QUEST_GOALS[key] });
  return [q("proofs", `Prove ${QUEST_GOALS.proofs} answers`), q("cards", `Review ${QUEST_GOALS.cards} cards`), q("first", "Finish a first try")];
}

/** The class goal for a week: 500 XP per student, rounded to a friendly number. */
export const classGoal = (students: number) => Math.max(500, Math.round((students * 500) / 500) * 500);
