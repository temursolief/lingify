import type { Schedule } from "./anki";

/** What the laptop keeps so the student can study flashcards and read passages with no internet. */

/** Dates travel as ISO strings in JSON and IndexedDB. */
export type StoredSchedule = Omit<Schedule, "due"> & { due: string };
export type OfflineCard = { id: string; front: string; back: string; noteType: string; schedule: StoredSchedule };

export const revive = (s: StoredSchedule): Schedule => ({ ...s, due: new Date(s.due) });
export const store = (s: Schedule): StoredSchedule => ({ ...s, due: s.due.toISOString() });

export type OfflineDeck = {
  id: string;
  name: string;
  css: Record<string, string>;
  /** due and soon-due cards plus today's new cards */
  cards: OfflineCard[];
  newLeft: number;
  reviewsLeft: number;
};

export type OfflinePassage = { id: string; slug: string; title: string; paragraphs: string[] };

export type OfflinePack = {
  userId: string;
  name: string;
  packedAt: string;
  decks: OfflineDeck[];
  passages: OfflinePassage[];
};

/** Flashcard answers given offline, sent to the server when the connection is back. */
export type OfflineQueue = { reviews: { cardId: string; rating: number; at: string }[] };

export const emptyQueue = (): OfflineQueue => ({ reviews: [] });
