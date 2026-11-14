import { addDays, dayKey, dayOf } from "./time";
import { stageFloorXp } from "./fortress";
import { fromTenths, missedDayPenalties, toTenths, totalsByDay, type DayCounts, type XpEvent } from "./xp";

type DayRow = { userId: string; day: Date; xp: number; first: number; proofs: number; cards: number };

/**
 * The XpDay rows from `from` on for one student: earned XP minus the day's cost, floored at the start of their
 * current stage, in tenths. Pure (no database), so it is tested directly; `refreshXp` in gamification.ts stores it.
 */
export function recount(userId: string, from: Date, events: XpEvent[], prior: { day: Date; xp: number; first: number; proofs: number; cards: number }[], today: Date): DayRow[] {
  const earned = totalsByDay(events, dayOf);
  // Days with real activity are what the streak walk and the penalties are built from; rows that only carry XP or a
  // charge are not.
  const counts = new Map<string, DayCounts>();
  for (const r of prior) if (r.first || r.proofs || r.cards) counts.set(dayKey(r.day), { first: r.first, proofs: r.proofs, cards: r.cards });
  for (const [key, t] of earned) if (t.first || t.proofs || t.cards) counts.set(key, { first: t.first, proofs: t.proofs, cards: t.cards });
  const penalties = missedDayPenalties(counts, today);

  const fromKey = dayKey(from);
  const yesterdayKey = dayKey(addDays(today, -1));
  const keys = new Set<string>();
  for (const key of earned.keys()) if (key >= fromKey) keys.add(key);
  for (const key of penalties.keys()) if (key >= fromKey) keys.add(key);
  // A row for yesterday marks the days up to it as charged, so the next read does not look again.
  if (counts.size && yesterdayKey >= fromKey) keys.add(yesterdayKey);

  let total = prior.reduce((n, r) => n + r.xp, 0);
  return [...keys].sort().map((key) => {
    const e = earned.get(key);
    const raw = toTenths(e?.xp ?? 0) - toTenths(penalties.get(key) ?? 0);
    // A loss cannot take the student below where their stage began: a built castle stands.
    const change = raw >= 0 ? raw : Math.max(raw, toTenths(stageFloorXp(fromTenths(total))) - total);
    total += change;
    return { userId, day: new Date(`${key}T00:00:00.000Z`), xp: change, first: e?.first ?? 0, proofs: e?.proofs ?? 0, cards: e?.cards ?? 0 };
  });
}

