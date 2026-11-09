import type { Phrase } from "./texts";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** "What does this phrase mean?" with the meanings of the text's other phrases as the other options. */
export function phraseQuestion(phrases: Pick<Phrase, "phrase" | "meaning">[], index: number) {
  const target = phrases[index];
  const options = [...new Set(phrases.map((p) => p.meaning))].sort((a, b) => hash(target.phrase + a) - hash(target.phrase + b));
  return { question: `What does “${target.phrase}” mean?`, options, answer: options.indexOf(target.meaning) };
}

export type AnswerKind = "COMPREHENSION" | "GIST" | "CCQ" | "GRAMMAR" | "DISCOVERY" | "PHRASE";
