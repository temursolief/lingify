import { answer, deckCounts, pickNext, type Rating, type Schedule } from "./anki";
import { revive, store, type OfflineCard } from "./offline-types";

/**
 * A study session that runs in the browser. The server sends the cards that can come up today (`studyQueue` in
 * decks.ts, or the offline copy); every answer is then scheduled here with the same Anki code as the server, so
 * the next card shows at once and the answer is sent in the background.
 */
export type StudyQueue = {
  cards: OfflineCard[];
  /** new cards and reviews still allowed today (Anki's daily limits) */
  newLeft: number;
  reviewsLeft: number;
  /** reviews due today that are not in `cards` yet; the session asks for them when these run out */
  moreDue?: number;
  /** reviews due up to this moment (ISO) count as due today: the end of the school's day. Without it, the device's day. */
  dueBy?: string;
};

export type LiveCard = Omit<OfflineCard, "schedule"> & { schedule: Schedule };
export type StudyCounts = { new: number; learn: number; due: number };

const live = (q: StudyQueue): LiveCard[] => q.cards.map((c) => ({ ...c, schedule: revive(c.schedule) }));
const dayEnd = (q: StudyQueue) => (q.dueBy ? Date.parse(q.dueBy) : undefined);

/** The card to show now, in Anki's order, or null when nothing is due for the moment. */
export function nextCard(q: StudyQueue, now: Date): LiveCard | null {
  return pickNext(live(q), now, q.newLeft, q.reviewsLeft, dayEnd(q));
}

/** The New / Learn / Due numbers above the card. */
export function queueCounts(q: StudyQueue, now: Date): StudyCounts {
  const counts = deckCounts(live(q).map((c) => c.schedule), now, q.newLeft, q.reviewsLeft, dayEnd(q));
  return q.moreDue ? { ...counts, due: Math.min(q.reviewsLeft, counts.due + q.moreDue) } : counts;
}

/** The queue after one answer: the card rescheduled and today's limits counted down. */
export function applyAnswer<Q extends StudyQueue>(q: Q, cardId: string, rating: Rating, now: Date): Q {
  const card = q.cards.find((c) => c.id === cardId);
  if (!card) return q;
  const before = revive(card.schedule);
  const next = store(answer(before, rating, now));
  return {
    ...q,
    newLeft: before.queue === "NEW" ? Math.max(0, q.newLeft - 1) : q.newLeft,
    reviewsLeft: before.queue === "REVIEW" ? Math.max(0, q.reviewsLeft - 1) : q.reviewsLeft,
    cards: q.cards.map((c) => (c.id === cardId ? { ...c, schedule: next } : c)),
  };
}
