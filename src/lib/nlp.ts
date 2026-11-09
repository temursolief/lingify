import winkNLP, { type ItemSentence, type ItemToken, type ItsFunction } from "wink-nlp";
import model from "wink-eng-lite-web-model";
import { canonicalLemma } from "./lemma";

const nlp = winkNLP(model);
const its = nlp.its;
// wink-nlp types its.lemma as needing model add-ons; the lite model provides them at runtime.
const lemmaOf = its.lemma as unknown as ItsFunction<string>;

const COUNTABLE_LEMMA = /^[a-z]+(?:'[a-z]+)?$/;
const EXCLUDED_POS = new Set(["PUNCT", "SYM", "NUM", "PROPN", "SPACE", "X"]);
const ORDINAL = /(?:teenth|tieth|hundredth|thousandth|millionth)$/;
const OPENERS = new Set(["“", "\"", "‘", "'", ":", "(", "—", "–"]);

export type Token = {
  /** surface form */
  v: string;
  /** preceding whitespace */
  s: string;
  /** lemma; null for punctuation, numbers, proper nouns — these never count against coverage */
  l: string | null;
  /** sentence index into the text's sentences array */
  i: number;
};

export type TokenizedText = {
  paragraphs: Token[][];
  sentences: string[];
  lemmaCounts: Record<string, number>;
  wordCount: number;
};

export function normalizeLemma(lemma: string, pos: string): string | null {
  if (EXCLUDED_POS.has(pos)) return null;
  if (ORDINAL.test(lemma.toLowerCase())) return null;
  const l = lemma.toLowerCase();
  return COUNTABLE_LEMMA.test(l) ? l : null;
}

export function tokenize(paragraphTexts: string[]): TokenizedText {
  const paragraphs: Token[][] = [];
  const sentences: string[] = [];
  const lemmaCounts: Record<string, number> = {};
  let wordCount = 0;

  for (const para of paragraphTexts) {
    const doc = nlp.readDoc(para.trim());
    const tokens: Token[] = [];
    doc.sentences().each((sentence: ItemSentence) => {
      const sentenceIndex = sentences.length;
      sentences.push(sentence.out());
      let seenWord = false;
      let previous = "";
      sentence.tokens().each((t: ItemToken) => {
        const value = t.out(its.value) as string;
        const pos = t.out(its.pos) as string;
        // A capitalised word mid-sentence is a name or nationality the tagger missed; it should not count against coverage.
        const looksProper = seenWord && value !== "I" && /^[A-Z]/.test(value) && !OPENERS.has(previous);
        const raw = looksProper ? null : normalizeLemma(t.out(lemmaOf), pos);
        const lemma = raw && canonicalLemma(raw, value, pos);
        if (/[a-z]/i.test(value)) seenWord = true;
        previous = value;
        tokens.push({ v: value, s: t.out(its.precedingSpaces) as string, l: lemma, i: sentenceIndex });
        if (/[a-z]/i.test(value) && pos !== "PUNCT") wordCount++;
        if (lemma) lemmaCounts[lemma] = (lemmaCounts[lemma] ?? 0) + 1;
      });
    });
    paragraphs.push(tokens);
  }
  return { paragraphs, sentences, lemmaCounts, wordCount };
}

export function lemmatizeWord(word: string): { lemma: string; pos: string } {
  const token = nlp.readDoc(word).tokens().itemAt(0);
  return {
    lemma: token.out(lemmaOf).toLowerCase(),
    pos: token.out(its.pos) as string,
  };
}
