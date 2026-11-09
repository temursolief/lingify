import { describe, expect, it } from "vitest";
import { GRADUATE_STREAK, schedule } from "../src/lib/srs";

const fresh = { srsInterval: 0, srsEase: 2.5, srsStreak: 0, srsReviews: 0, srsLapses: 0 };
const now = new Date("2026-01-01T10:00:00Z");

describe("schedule", () => {
  it("spaces correct answers further apart: 1, 3, then growing days", () => {
    let state = fresh;
    const intervals: number[] = [];
    for (let i = 0; i < GRADUATE_STREAK - 1; i++) {
      const next = schedule(state, true, now);
      intervals.push(next.srsInterval);
      state = next;
    }
    expect(intervals.slice(0, 2)).toEqual([1, 3]);
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });

  it("graduates a word after the required streak", () => {
    let state = fresh;
    let result = schedule(state, true, now);
    for (let i = 1; i < GRADUATE_STREAK; i++) {
      state = result;
      result = schedule(state, true, now);
    }
    expect(result.graduated).toBe(true);
    expect(result.srsDue).toBeNull();
  });

  it("resets the streak and brings the word back within minutes after a mistake", () => {
    const result = schedule({ ...fresh, srsStreak: 3, srsInterval: 7 }, false, now);
    expect(result.srsStreak).toBe(0);
    expect(result.srsLapses).toBe(1);
    expect(result.srsDue!.getTime() - now.getTime()).toBeLessThanOrEqual(15 * 60_000);
    expect(result.srsEase).toBeLessThan(2.5);
  });
});
