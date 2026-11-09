import { describe, expect, it } from "vitest";
import { addDays, dayKey, streakFrom, weekStart } from "../src/lib/time";

const today = new Date("2026-11-11T00:00:00Z");
const days = (...offsets: number[]) => new Set(offsets.map((o) => dayKey(addDays(today, -o))));

describe("streakFrom", () => {
  it("counts consecutive days including today", () => expect(streakFrom(days(0, 1, 2, 4), today)).toBe(3));
  it("keeps yesterday's streak alive before today's reading", () => expect(streakFrom(days(1, 2), today)).toBe(2));
  it("is zero after a missed day", () => expect(streakFrom(days(2, 3), today)).toBe(0));
});

describe("weekStart", () => {
  it("returns Monday", () => expect(dayKey(weekStart(today))).toBe("2026-11-09"));
});
