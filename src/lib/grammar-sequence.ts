/**
 * The order in which B1 learners tend to acquire these structures (Krashen's natural order, adapted from
 * English Grammar Profile levels). Grammar practice follows the student's place in this sequence.
 */
export const GRAMMAR_SEQUENCE = [
  { key: "be-going-to", stage: 1, label: "going to for plans" },
  { key: "past-continuous", stage: 1, label: "Past continuous" },
  { key: "comparatives-modifiers", stage: 1, label: "Much / far + comparative" },
  { key: "used-to", stage: 1, label: "used to for past habits" },
  { key: "present-perfect-experience", stage: 2, label: "Present perfect: experiences" },
  { key: "present-perfect-since", stage: 2, label: "Present perfect with since / for" },
  { key: "first-conditional", stage: 2, label: "First conditional" },
  { key: "modals-possibility", stage: 2, label: "might / may for possibility" },
  { key: "present-passive", stage: 3, label: "Present passive" },
  { key: "past-passive", stage: 3, label: "Past passive" },
  { key: "linking-contrast", stage: 3, label: "although / while for contrast" },
  { key: "relative-where", stage: 3, label: "Relative clauses with where" },
  { key: "gerund-after-preposition", stage: 3, label: "Preposition + -ing" },
  { key: "so-too", stage: 3, label: "so … that / too … to" },
  { key: "past-perfect", stage: 4, label: "Past perfect" },
  { key: "future-in-past", stage: 4, label: "was going to" },
  { key: "second-conditional", stage: 4, label: "Second conditional" },
  { key: "modal-passive", stage: 4, label: "can be / must be + past participle" },
  { key: "reported-speech", stage: 5, label: "Reported speech" },
  { key: "reported-questions", stage: 5, label: "Reported and indirect questions" },
  { key: "reported-commands", stage: 5, label: "tell someone (not) to" },
  { key: "past-continuous-passive", stage: 5, label: "was being + past participle" },
  { key: "past-perfect-passive", stage: 5, label: "had been + past participle" },
] as const;

export type GrammarKey = (typeof GRAMMAR_SEQUENCE)[number]["key"];

const byKey = new Map<string, (typeof GRAMMAR_SEQUENCE)[number]>(GRAMMAR_SEQUENCE.map((g) => [g.key, g]));

export function grammarInfo(key: string) {
  return byKey.get(key);
}

/** A structure counts as mastered after this many correct first tries on its exercises. */
export const MASTERY_CORRECT = 2;
/** A stage is complete when this share of its structures is mastered. */
const STAGE_COMPLETE = 0.6;

/** The stage the learner is working on now: one past the highest completed stage. */
export function readyStage(mastered: Set<string>) {
  let stage = 1;
  for (let s = 1; s <= 5; s++) {
    const keys = GRAMMAR_SEQUENCE.filter((g) => g.stage === s);
    const done = keys.filter((g) => mastered.has(g.key)).length / keys.length;
    if (done >= STAGE_COMPLETE) stage = s + 1;
    else break;
  }
  return Math.min(stage, 5);
}

/** Structures more than one stage ahead are shown as an optional preview rather than as practice. */
export function isPreview(key: string, stage: number) {
  const info = byKey.get(key);
  return !!info && info.stage > stage + 1;
}
