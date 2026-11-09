import type { Token } from "./nlp";

export type { Token };

export type Question = { question: string; options: string[]; answer: number; explanation: string };

export type GrammarPoint = {
  structure: string;
  explanation: string;
  /** a sentence copied from the text that shows the structure */
  example: string;
  exercise: Question;
};

export type LemmaCounts = Record<string, number>;

/** Minimum share of running words a student must already know before a text unlocks. */
export const MIN_COVERAGE = 0.95;
/** At or above this coverage a text counts as a pleasure read: exercises become optional. */
export const PLEASURE_COVERAGE = 0.98;

export type TextLevel = "locked" | "study" | "pleasure";

export function levelFor(coverage: number): TextLevel {
  if (coverage >= PLEASURE_COVERAGE) return "pleasure";
  if (coverage >= MIN_COVERAGE) return "study";
  return "locked";
}

export function coverageOf(lemmaCounts: LemmaCounts, known: Set<string>) {
  let total = 0;
  let knownTokens = 0;
  const unknown: string[] = [];
  for (const [lemma, count] of Object.entries(lemmaCounts)) {
    total += count;
    if (known.has(lemma)) knownTokens += count;
    else unknown.push(lemma);
  }
  return { coverage: total ? knownTokens / total : 1, unknownLemmas: unknown };
}

export function readingMinutes(wordCount: number, wpm: number) {
  return Math.max(1, Math.round(wordCount / wpm));
}
