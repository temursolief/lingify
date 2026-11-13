import { describe, expect, it } from "vitest";
import { allQuestsDone, classGoal, countsByDay, levelOf, questsFor, streakOf, totalXp, type DayCounts, type XpEvent } from "../src/lib/xp";

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

  it("sets a class goal of 500 XP per student", () => {
    expect(classGoal(12)).toBe(6000);
    expect(classGoal(0)).toBe(500);
  });
});
