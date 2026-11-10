import type { GlossaryEntry } from "./glossary";
import type { GradableState } from "./review-grade";
import type { ReviewCard } from "./review-queue";
import type { Mark, Token } from "./texts";

/** What the laptop keeps so the student can read and review with no internet. */
export type OfflineText = {
  id: string;
  slug: string;
  title: string;
  genre: string;
  assigned: boolean;
  paragraphs: Token[][];
  /** meanings for every word in the text the student does not know yet */
  glosses: Record<string, GlossaryEntry>;
  phrases: { phrase: string; meaning: string; uz?: string; marks: Mark[] }[];
  learning: string[];
};

export type OfflineCard = ReviewCard & { answer: string; dueAt: string; state: GradableState };

export type OfflinePack = {
  userId: string;
  name: string;
  uzbek: boolean;
  packedAt: string;
  texts: OfflineText[];
  review: { mode: "typed" | "choice"; cards: OfflineCard[] };
};

/** Things done offline, sent to the server when the connection is back. */
export type OfflineQueue = {
  reviews: { lemma: string; answer: string; at: string }[];
  lookups: { textId: string; lemma: string; word: string; sentenceIndex: number; at: string }[];
  finished: { textId: string; at: string }[];
};

export const emptyQueue = (): OfflineQueue => ({ reviews: [], lookups: [], finished: [] });
