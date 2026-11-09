/**
 * Turns data/word-frequency.json (surface words by frequency) into
 * data/lemma-ranks.json: [lemma, pos][] ordered by frequency of the lemma's most common form.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import wordListPath from "word-list";
import { lemmatizeWord } from "../src/lib/nlp";
import { IRREGULAR } from "../src/lib/lemma";

const MAX_LEMMAS = 15000;
const root = path.resolve(import.meta.dirname, "..");
const words: string[] = JSON.parse(readFileSync(path.join(root, "data/word-frequency.json"), "utf8"));
const dictionary = new Set(readFileSync(wordListPath, "utf8").split("\n"));
// Hunspell keeps proper nouns capitalised, so it can tell "book" from "Murphy" or "Google".
const hunspell = readFileSync(path.join(root, "node_modules/dictionary-en/index.dic"), "utf8").split("\n").map((l) => l.split("/")[0]);
const lowerEntries = new Set(hunspell.filter((w) => /^[a-z]/.test(w)));
const capitalEntries = new Set(hunspell.filter((w) => /^[A-Z][a-z]/.test(w)).map((w) => w.toLowerCase()));
const isPlainWord = (lemma: string) => (lowerEntries.has(lemma) && !capitalEntries.has(lemma) ? 1 : 0);

const seen = new Set<string>();
const ranks: [string, string, 0 | 1][] = [];
const forms: Record<string, string> = {};

for (const [rank, word] of words.entries()) {
  if (ranks.length >= MAX_LEMMAS) break;
  const lemmatized = lemmatizeWord(word);
  const pos = lemmatized.pos;
  const lemma = IRREGULAR[word] ?? lemmatized.lemma;
  if (pos === "PROPN" || pos === "NUM" || pos === "PUNCT" || pos === "SYM" || pos === "X") continue;
  if (!/^[a-z]+(?:'[a-z]+)?$/.test(lemma)) continue;
  if (rank >= 1000 && !dictionary.has(lemma) && !dictionary.has(word)) continue;
  if (word !== lemma && !(word in forms)) forms[word] = lemma;
  if (seen.has(lemma)) continue;
  seen.add(lemma);
  ranks.push([lemma, pos, isPlainWord(lemma)]);
}

// Common words the frequency tokenizer splits apart; inserted at a realistic rank.
for (const [lemma, pos, rank] of [["o'clock", "ADV", 1500]] as const) {
  if (!seen.has(lemma)) ranks.splice(rank, 0, [lemma, pos, 0]);
}
ranks.length = Math.min(ranks.length, MAX_LEMMAS);

writeFileSync(path.join(root, "data/lemma-ranks.json"), JSON.stringify(ranks));
const ranked = new Set(ranks.map(([l]) => l));
const usefulForms = Object.fromEntries(Object.entries(forms).filter(([, lemma]) => ranked.has(lemma)));
writeFileSync(path.join(root, "data/lemma-forms.json"), JSON.stringify(usefulForms));
console.log(`wrote ${Object.keys(usefulForms).length} word forms`);
console.log(`wrote ${ranks.length} lemmas`);
console.log("first 40:", ranks.slice(0, 40).map((r) => r[0]).join(" "));
console.log("around 2000:", ranks.slice(1990, 2020).map((r) => r[0]).join(" "));
console.log("around 5000:", ranks.slice(4990, 5020).map((r) => r[0]).join(" "));
