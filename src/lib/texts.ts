import type { Token } from "./nlp";

export type { Token };

export type Question = { question: string; options: string[]; answer: number; explanation: string };

export const READING_SKILLS = ["gist", "detail", "inference", "reference", "vocabulary", "attitude", "organisation"] as const;
export type ReadingSkill = (typeof READING_SKILLS)[number];
export const SKILL_LABEL: Record<ReadingSkill, string> = {
  gist: "Main idea",
  detail: "Specific information",
  inference: "Reading between the lines",
  reference: "Reference words (it, they, this)",
  vocabulary: "Meaning from context",
  attitude: "Writer's or character's attitude",
  organisation: "How the text is organised",
};

export type SkillQuestion = Question & { skill: ReadingSkill };

/** A run of tokens in one paragraph: tokens[from..to] inclusive. */
export type Mark = { p: number; from: number; to: number };

export type GrammarPoint = {
  key: string;
  structure: string;
  explanation: string;
  /** a sentence copied from the text that shows the structure */
  example: string;
  /** example sentences for guided discovery; the first comes from the text */
  examples: string[];
  highlights: string[];
  /** where the structure appears in the text, for noticing */
  marks: Mark[];
  discovery: Question;
  exercise: Question;
  /** a short note in Uzbek on why this structure is hard for Uzbek speakers */
  uzNote?: string;
};

export type Choice = { question: string; options: string[]; answer: number };
export type PreTeachWord = { word: string; lemma: string; definition: string; ccq: Choice };
export type Phrase = { phrase: string; meaning: string; uz?: string; inText: string; marks: Mark[] };

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
