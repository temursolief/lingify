import forms from "../../data/lemma-forms.json";
import { frequencyRank } from "./frequency";

/** Irregular forms the wink model leaves unlemmatized. Forms that are also common nouns (bit, ground, shot) are left out on purpose. */
export const IRREGULAR: Record<string, string> = {
  drank: "drink", burnt: "burn", clung: "cling", forgave: "forgive", forbidden: "forbid", knelt: "kneel",
  leant: "lean", learnt: "learn", lain: "lie", ridden: "ride", shone: "shine", spat: "spit", stunk: "stink",
  swam: "swim", swum: "swim", worn: "wear", bent: "bend", lit: "light", dreamt: "dream", spelt: "spell",
  // Uncountable -ics nouns the model wrongly singularises.
  physics: "physics", mathematics: "mathematics", economics: "economics", politics: "politics", athletics: "athletics",
  electronics: "electronics", statistics: "statistics", ethics: "ethics", genetics: "genetics", linguistics: "linguistics",
};

const formMap = forms as Record<string, string>;

function suffixBases(word: string): string[] {
  const bases: string[] = [];
  const add = (stem: string) => stem.length >= 3 && bases.push(stem);
  const undouble = (stem: string) => (/([bdfglmnprt])\1$/.test(stem) ? stem.slice(0, -1) : null);
  for (const suffix of ["ed", "ing"]) {
    if (!word.endsWith(suffix)) continue;
    const stem = word.slice(0, -suffix.length);
    add(stem);
    add(stem + "e");
    const single = undouble(stem);
    if (single) add(single);
    if (suffix === "ed" && stem.endsWith("i")) add(stem.slice(0, -1) + "y");
  }
  if (word.endsWith("ly")) {
    const stem = word.slice(0, -2);
    add(stem);
    if (stem.endsWith("i")) add(stem.slice(0, -1) + "y");
    if (word.endsWith("ally")) add(word.slice(0, -4));
    if (word.endsWith("ily")) add(word.slice(0, -3) + "y");
    if (word.endsWith("bly") || word.endsWith("ply")) add(stem + "le");
  }
  return bases;
}

/**
 * Maps a token to the most frequent member of its word family, so "relaxed", "smiling" and "drank"
 * count as known when the learner knows "relax", "smile" and "drink".
 */
export function canonicalLemma(lemma: string, surface: string, pos: string): string {
  const lower = surface.toLowerCase();
  const candidates = [lemma, IRREGULAR[lower], IRREGULAR[lemma], formMap[lower], formMap[lemma]];
  if (pos === "ADJ" || pos === "ADV") candidates.push(...suffixBases(lower), ...suffixBases(lemma));

  let best = lemma;
  let bestRank = frequencyRank(lemma) ?? Infinity;
  for (const c of candidates) {
    if (!c) continue;
    const rank = frequencyRank(c);
    if (rank !== undefined && rank < bestRank) {
      best = c;
      bestRank = rank;
    }
  }
  return best;
}
