import glossary from "../../content/glossary.json";

export type GlossaryEntry = { pos: string; definition: string };

const entries = glossary as unknown as Record<string, [string, string]>;

/** Learner-friendly B1 definition written for this library, if we have one. */
export function glossaryEntry(lemma: string): GlossaryEntry | null {
  const e = entries[lemma];
  return e ? { pos: e[0], definition: e[1] } : null;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Options for "guess the meaning from context": the right definition plus two from other words with the same
 * part of speech, in a stable order so a reload does not reshuffle them.
 */
export function guessOptions(lemma: string): { options: string[]; answer: number } | null {
  const entry = glossaryEntry(lemma);
  if (!entry) return null;
  const others = Object.entries(entries)
    .filter(([word, [pos, def]]) => word !== lemma && pos === entry.pos && def !== entry.definition && !def.includes("made-up"))
    .sort((a, b) => hash(lemma + a[0]) - hash(lemma + b[0]))
    .slice(0, 2)
    .map(([, [, def]]) => def);
  if (others.length < 2) return null;
  const options = [entry.definition, ...others].sort((a, b) => hash(a + lemma) - hash(b + lemma));
  return { options, answer: options.indexOf(entry.definition) };
}
