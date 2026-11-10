import awl from "../../data/awl.json";

/** Coxhead's Academic Word List (2000): 570 headwords in 10 sublists, most frequent first. */
const SUBLISTS = awl as Record<string, string[]>;

/** The list uses British spellings; our lemmas may use either, so both are accepted. */
function variants(headword: string) {
  const v = new Set([headword]);
  if (headword.endsWith("ise")) v.add(headword.replace(/ise$/, "ize"));
  if (headword.endsWith("yse")) v.add(headword.replace(/yse$/, "yze"));
  if (headword.endsWith("our")) v.add(headword.replace(/our$/, "or"));
  if (headword === "licence") v.add("license");
  return [...v];
}

const lemmaToHeadword = new Map<string, string>();
const headwordSublist = new Map<string, number>();
for (const [sublist, words] of Object.entries(SUBLISTS)) {
  for (const w of words) {
    headwordSublist.set(w, Number(sublist));
    for (const v of variants(w)) lemmaToHeadword.set(v, w);
  }
}

export function awlHeadword(lemma: string) {
  return lemmaToHeadword.get(lemma) ?? null;
}

export function awlSublist(lemma: string) {
  const h = lemmaToHeadword.get(lemma);
  return h ? headwordSublist.get(h)! : null;
}

export function awlProgress(known: Set<string>) {
  const sublists = Object.entries(SUBLISTS).map(([sublist, words]) => {
    const knownWords = words.filter((w) => variants(w).some((v) => known.has(v)));
    return { sublist: Number(sublist), known: knownWords.length, total: words.length };
  });
  return {
    sublists,
    known: sublists.reduce((n, s) => n + s.known, 0),
    total: sublists.reduce((n, s) => n + s.total, 0),
  };
}
