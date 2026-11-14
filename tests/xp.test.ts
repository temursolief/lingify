import { describe, expect, it } from "vitest";
import { allQuestsDone, classGoal, countsByDay, fmtXp, levelOf, missedDayPenalties, questsFor, streakOf, totalsByDay, totalXp, XP, XP_LOSS, type DayCounts, type XpEvent } from "../src/lib/xp";

const utcDay = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
const real: DayCounts = { first: 0, proofs: 1, cards: 0 };
const questsDone: DayCounts = { first: 1, proofs: 2, cards: 20 };
const idle: DayCounts = { first: 0, proofs: 0, cards: 3 };

describe("levels", () => {
  it("starts at level 1 and climbs at 40·L·(L−1)", () => {
    expect(levelOf(0)).toEqual({ level: 1, from: 0, to: 80 });
    expect(levelOf(79).level).toBe(1);
    expect(levelOf(80).level).toBe(2);
    expect(levelOf(2340)).toEqual({ level: 8, from: 2240, to: 2880 });
  });
});

describe("streak and shields", () => {
  it("counts consecutive real days up to today", () => {
    const days = new Map([
      ["2026-11-10", real],
      ["2026-11-11", real],
      ["2026-11-12", real],
    ]);
    expect(streakOf(days, day("2026-11-12"))).toEqual({ streak: 3, best: 3, shields: 0, todayDone: true });
  });

  it("does not break the streak for today before the student has done anything", () => {
    const days = new Map([
      ["2026-11-10", real],
      ["2026-11-11", real],
    ]);
    expect(streakOf(days, day("2026-11-12"))).toMatchObject({ streak: 2, todayDone: false });
  });

  it("breaks on a missed day without a shield", () => {
    const days = new Map([
      ["2026-11-09", real],
      ["2026-11-10", idle],
      ["2026-11-11", real],
    ]);
    expect(streakOf(days, day("2026-11-11"))).toMatchObject({ streak: 1, best: 1 });
  });

  it("earns a shield for all three quests and spends it on a missed day", () => {
    const days = new Map([
      ["2026-11-09", questsDone],
      ["2026-11-11", real],
    ]);
    expect(streakOf(days, day("2026-11-11"))).toEqual({ streak: 2, best: 2, shields: 0, todayDone: true });
  });

  it("keeps at most two shields", () => {
    const days = new Map([
      ["2026-11-08", questsDone],
      ["2026-11-09", questsDone],
      ["2026-11-10", questsDone],
    ]);
    expect(streakOf(days, day("2026-11-10")).shields).toBe(2);
  });

  it("is zero with no activity", () => {
    expect(streakOf(new Map(), day("2026-11-10"))).toEqual({ streak: 0, best: 0, shields: 0, todayDone: false });
  });
});

describe("quests and days", () => {
  it("counts events per day and fills the quests", () => {
    const events: XpEvent[] = [
      { kind: "first", at: new Date("2026-11-10T08:00:00Z"), xp: 30 },
      { kind: "proof", at: new Date("2026-11-10T09:00:00Z"), xp: 20 },
      { kind: "tag", at: new Date("2026-11-10T09:00:00Z"), xp: 5 },
      ...Array.from({ length: 25 }, (_, i) => ({ kind: "card" as const, at: new Date(`2026-11-10T10:${String(i).padStart(2, "0")}:00Z`), xp: i % 2 ? 2 : 0 })),
    ];
    const days = countsByDay(events, utcDay);
    expect(days.get("2026-11-10")).toEqual({ first: 1, proofs: 1, cards: 25 });
    const quests = questsFor(days.get("2026-11-10"));
    expect(quests.map((q) => [q.key, q.count, q.done])).toEqual([
      ["proofs", 1, false],
      ["cards", 20, true],
      ["first", 1, true],
    ]);
    expect(allQuestsDone(days.get("2026-11-10")!)).toBe(false);
    expect(totalXp(events)).toBe(30 + 20 + 5 + 12 * 2);
  });

  it("sets a class goal of 150 XP per student, at least 300", () => {
    expect(classGoal(12)).toBe(1800);
    expect(classGoal(1)).toBe(300);
    expect(classGoal(0)).toBe(300);
  });
});

describe("daily totals for the XpDay rollup", () => {
  const at = (iso: string) => new Date(iso);
  const events: XpEvent[] = [
    { kind: "first", at: at("2026-11-10T09:00:00Z"), xp: 30 },
    { kind: "proof", at: at("2026-11-10T09:10:00Z"), xp: 20 },
    { kind: "tag", at: at("2026-11-10T09:10:00Z"), xp: 5 },
    { kind: "card", at: at("2026-11-11T08:00:00Z"), xp: 2 },
    { kind: "card", at: at("2026-11-11T08:01:00Z"), xp: 0 },
    { kind: "homework", at: at("2026-11-11T10:00:00Z"), xp: 50 },
  ];

  it("sums XP and counts quest actions per day", () => {
    const days = totalsByDay(events, utcDay);
    expect(days.get("2026-11-10")).toEqual({ xp: 55, first: 1, proofs: 1, cards: 0 });
    expect(days.get("2026-11-11")).toEqual({ xp: 52, first: 0, proofs: 0, cards: 2 });
  });

  it("agrees with the event-level totals, so the rollup and the old derivation match", () => {
    const days = totalsByDay(events, utcDay);
    expect([...days.values()].reduce((n, d) => n + d.xp, 0)).toBe(totalXp(events));
    const counts = countsByDay(events, utcDay);
    for (const [key, d] of days) expect({ first: d.first, proofs: d.proofs, cards: d.cards }).toEqual(counts.get(key));
  });
});

describe("point values", () => {
  it("keeps every answer at 3 XP or less and shows decimals cleanly", () => {
    expect(Math.max(XP.correct, XP.proof, XP.proofElsewhere, XP.tag, XP.card, XP.homework)).toBe(3);
    expect(fmtXp(12)).toBe("12");
    expect(fmtXp(12.04)).toBe("12");
    expect(fmtXp(12.46)).toBe("12.5");
    expect(fmtXp(-3)).toBe("−3");
    expect(fmtXp(1234.5)).toBe("1,234.5");
  });
});

describe("missed-day penalties", () => {
  const real: DayCounts = { first: 1, proofs: 0, cards: 12 };
  const questsAll: DayCounts = { first: 1, proofs: 2, cards: 20 };
  const noWords: DayCounts = { first: 1, proofs: 0, cards: 0 };
  const d = (key: string) => new Date(`${key}T00:00:00.000Z`);

  it("charges nothing for today, or before the first day", () => {
    const days = new Map([["2026-11-10", real]]);
    expect(missedDayPenalties(days, d("2026-11-10")).size).toBe(0);
    expect(missedDayPenalties(new Map(), d("2026-11-10")).size).toBe(0);
  });

  it("charges an idle day and a day without words, and a day that is both gets both", () => {
    const days = new Map([
      ["2026-11-10", real],
      ["2026-11-12", noWords],
    ]);
    const p = missedDayPenalties(days, d("2026-11-13"));
    expect(p.get("2026-11-10")).toBeUndefined();
    expect(p.get("2026-11-11")).toBe(XP_LOSS.idleDay + XP_LOSS.noWords);
    expect(p.get("2026-11-12")).toBe(XP_LOSS.noWords);
  });

  it("lets a shield cover the idle day but never the words", () => {
    const days = new Map([["2026-11-10", questsAll]]);
    const p = missedDayPenalties(days, d("2026-11-12"));
    // day 11: idle, shield spent: only the missing words cost XP
    expect(p.get("2026-11-11")).toBe(XP_LOSS.noWords);
  });

  it("stops charging after seven idle days in a row", () => {
    const days = new Map([["2026-11-01", real]]);
    const p = missedDayPenalties(days, d("2026-11-20"));
    const charged = [...p.keys()].filter((k) => k > "2026-11-01");
    expect(charged).toHaveLength(7);
    expect(charged.at(-1)).toBe("2026-11-08");
  });

  it("starts again when the student returns and then goes quiet", () => {
    const days = new Map([
      ["2026-11-01", real],
      ["2026-11-15", real],
    ]);
    const p = missedDayPenalties(days, d("2026-11-18"));
    expect(p.get("2026-11-16")).toBe(XP_LOSS.idleDay + XP_LOSS.noWords);
    expect(p.get("2026-11-12")).toBeUndefined();
  });
});
