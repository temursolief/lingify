import { describe, expect, it } from "vitest";
import { answer, deckCounts, intervalLabel, newSchedule, OPTIONS, pickNext, type Schedule } from "../src/lib/anki";

const now = new Date("2026-11-10T10:00:00");
const minutes = (s: Schedule) => Math.round((s.due.getTime() - now.getTime()) / 60_000);
const days = (s: Schedule) => Math.round((s.due.getTime() - now.getTime()) / 86_400_000);

describe("Anki scheduler (default options, 20-day cap)", () => {
  const fresh = newSchedule(now);

  it("shows Anki's labels on a new card", () => {
    expect([1, 2, 3, 4].map((r) => intervalLabel(fresh, r as 1 | 2 | 3 | 4, now))).toEqual(["1m", "6m", "10m", "4d"]);
  });

  it("graduates a learning card after the last step", () => {
    const step1 = answer(fresh, 3, now);
    expect(step1.queue).toBe("LEARNING");
    expect(minutes(step1)).toBe(10);
    const graduated = answer(step1, 3, now);
    expect(graduated.queue).toBe("REVIEW");
    expect(graduated.interval).toBe(1);
    expect(days(graduated)).toBe(1);
  });

  it("Again on a review card relearns it and lowers ease", () => {
    const review: Schedule = { ...fresh, queue: "REVIEW", interval: 10, ease: 2500 };
    const lapsed = answer(review, 1, now);
    expect(lapsed.queue).toBe("RELEARNING");
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.ease).toBe(2300);
    expect(minutes(lapsed)).toBe(10);
  });

  it("never schedules more than 20 days ahead", () => {
    let s: Schedule = { ...fresh, queue: "REVIEW", interval: 8, ease: 2500 };
    for (let i = 0; i < 6; i++) s = answer(s, 4, now);
    expect(s.interval).toBe(OPTIONS.maxInterval);
    expect(days(s)).toBeLessThanOrEqual(20);
    expect(answer({ ...s, interval: 19 }, 3, now).interval).toBe(20);
  });

  it("orders learning first, then reviews, then new cards", () => {
    const cards = [
      { id: "new", schedule: newSchedule(now) },
      { id: "review", schedule: { ...fresh, queue: "REVIEW" as const, due: new Date(now.getTime() - 1000) } },
      { id: "learning", schedule: { ...fresh, queue: "LEARNING" as const, due: new Date(now.getTime() - 1000) } },
    ];
    expect(pickNext(cards, now, 20, 200)?.id).toBe("learning");
    expect(pickNext(cards.slice(0, 2), now, 20, 200)?.id).toBe("review");
    expect(pickNext(cards.slice(0, 1), now, 0, 200)).toBeNull();
  });

  it("counts new cards up to the daily limit", () => {
    expect(deckCounts(Array.from({ length: 30 }, () => newSchedule(now)), now, 20, 200)).toEqual({ new: 20, learn: 0, due: 0 });
  });
});
