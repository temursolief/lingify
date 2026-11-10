import { describe, expect, it } from "vitest";
import { newSchedule, type Schedule } from "../src/lib/anki";
import { store, type OfflineCard } from "../src/lib/offline-types";
import { applyAnswer, nextCard, queueCounts, type StudyQueue } from "../src/lib/study";

const now = new Date("2026-11-10T10:00:00Z");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

const card = (id: string, schedule: Partial<Schedule> = {}, position = 0): OfflineCard => ({
  id,
  front: id,
  back: id,
  noteType: "basic",
  schedule: store({ ...newSchedule(new Date(0), position), ...schedule }),
});
const review = (id: string, due: Date) => card(id, { queue: "REVIEW", due, interval: 5, reps: 3 });

describe("study session in the browser", () => {
  it("shows reviews before new cards and counts both", () => {
    const q: StudyQueue = { cards: [card("n1"), review("r1", later(-60))], newLeft: 20, reviewsLeft: 200 };
    expect(nextCard(q, now)?.id).toBe("r1");
    expect(queueCounts(q, now)).toEqual({ new: 1, learn: 0, due: 1 });
  });

  it("moves an answered new card to learning and uses up one new card for today", () => {
    const q: StudyQueue = { cards: [card("n1", {}, 0), card("n2", {}, 1)], newLeft: 2, reviewsLeft: 200 };
    const after = applyAnswer(q, "n1", 3, now);
    expect(after.newLeft).toBe(1);
    expect(after.cards[0].schedule.queue).toBe("LEARNING");
    expect(nextCard(after, now)?.id).toBe("n2");
    // n1 comes back once n2 is answered: it is due within the learn-ahead window
    const last = applyAnswer(after, "n2", 4, now);
    expect(last.newLeft).toBe(0);
    expect(nextCard(last, now)?.id).toBe("n1");
    expect(queueCounts(last, now)).toEqual({ new: 0, learn: 1, due: 0 });
  });

  it("stops showing new cards when today's limit is used up", () => {
    const q: StudyQueue = { cards: [card("n1")], newLeft: 0, reviewsLeft: 200 };
    expect(nextCard(q, now)).toBeNull();
    expect(queueCounts(q, now).new).toBe(0);
  });

  it("finishes a review card and counts the review down", () => {
    const q: StudyQueue = { cards: [review("r1", later(-60))], newLeft: 0, reviewsLeft: 1 };
    const after = applyAnswer(q, "r1", 3, now);
    expect(after.reviewsLeft).toBe(0);
    expect(nextCard(after, now)).toBeNull();
  });

  it("uses the school's end of day, not the device's, when the server sends one", () => {
    const tonight = later(8 * 60);
    const q: StudyQueue = { cards: [review("r1", tonight)], newLeft: 0, reviewsLeft: 10 };
    expect(nextCard({ ...q, dueBy: later(9 * 60).toISOString() }, now)?.id).toBe("r1");
    expect(nextCard({ ...q, dueBy: later(60).toISOString() }, now)).toBeNull();
    expect(queueCounts({ ...q, dueBy: later(60).toISOString() }, now).due).toBe(0);
  });

  it("adds the reviews still on the server to the due number, within today's limit", () => {
    const q: StudyQueue = { cards: [review("r1", later(-60))], newLeft: 0, reviewsLeft: 5, moreDue: 30, dueBy: later(60).toISOString() };
    expect(queueCounts(q, now).due).toBe(5);
    expect(queueCounts({ ...q, reviewsLeft: 200 }, now).due).toBe(31);
  });

  it("ignores an answer for a card that is not in the queue", () => {
    const q: StudyQueue = { cards: [card("n1")], newLeft: 1, reviewsLeft: 1 };
    expect(applyAnswer(q, "missing", 3, now)).toBe(q);
  });
});
