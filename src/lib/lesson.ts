import type { Phrase } from "./texts";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** "What does this phrase mean?" with the meanings of the text's other phrases as the other options. */
export function phraseQuestion(phrases: Pick<Phrase, "phrase" | "meaning">[], index: number) {
  const target = phrases[index];
  const others = [...new Set(phrases.map((p) => p.meaning))]
    .filter((m) => m !== target.meaning)
    .sort((a, b) => hash(target.phrase + a) - hash(target.phrase + b))
    .slice(0, 3);
  const options = [target.meaning, ...others].sort((a, b) => hash(target.phrase + a) - hash(target.phrase + b));
  return { question: `What does “${target.phrase}” mean?`, options, answer: options.indexOf(target.meaning) };
}

export type AnswerKind = "COMPREHENSION" | "GIST" | "CCQ" | "GRAMMAR" | "DISCOVERY" | "PHRASE" | "COLLOCATION";

const PREPOSITIONS = ["in", "on", "at", "for", "by", "with", "of", "to", "about", "from"];
const VERBS = ["make", "take", "do", "get", "have", "keep", "give", "go", "pay", "spend", "put", "look", "come", "bring", "find", "save"];
const SKIP = new Set(["be", "a", "an", "the", "can't", "not", "it's", "you"]);

/**
 * "Which word completes the phrase?": the key partner word of a chunk (usually its verb or preposition) is
 * blanked, with options from the same family of words, so the student practises the collocation itself.
 */
export function collocationQuestion(phrases: Pick<Phrase, "phrase" | "meaning">[], index: number) {
  const target = phrases[index];
  const words = target.phrase.split(" ");
  const gapAt = words.findIndex((w) => !SKIP.has(w.toLowerCase()) && !w.includes("."));
  if (gapAt === -1) return null;
  const answer = words[gapAt].toLowerCase();
  const family = PREPOSITIONS.includes(answer) ? PREPOSITIONS : VERBS.includes(answer) ? VERBS : null;
  const pool = family ?? [...new Set(phrases.map((p) => p.phrase.split(" ").find((w) => !SKIP.has(w.toLowerCase()))?.toLowerCase()).filter(Boolean) as string[])];
  const others = pool.filter((w) => w !== answer).sort((a, b) => hash(target.phrase + a) - hash(target.phrase + b)).slice(0, 3);
  if (others.length < 2) return null;
  const options = [answer, ...others].sort((a, b) => hash(a + target.phrase) - hash(b + target.phrase));
  const gapped = words.map((w, i) => (i === gapAt ? "_____" : w)).join(" ");
  return { question: `Complete the phrase: ${gapped}`, hint: target.meaning, options, answer: options.indexOf(answer) };
}
