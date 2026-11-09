import ranks from "../../data/lemma-ranks.json";

export const BAND_SIZE = 1000;
/** [lemma, part of speech, 1 if an ordinary lowercase word (not a name or brand)] in frequency order */
export const lemmaRanks = ranks as [string, string, 0 | 1][];

const rankOf = new Map(lemmaRanks.map(([lemma], i) => [lemma, i]));

export function frequencyRank(lemma: string): number | undefined {
  return rankOf.get(lemma);
}

/** 1-based frequency band (1 = most common 1,000 lemmas). */
export function bandOf(lemma: string): number | undefined {
  const rank = rankOf.get(lemma);
  return rank === undefined ? undefined : Math.floor(rank / BAND_SIZE) + 1;
}

export function bandLemmas(band: number): [string, string, 0 | 1][] {
  return lemmaRanks.slice((band - 1) * BAND_SIZE, band * BAND_SIZE);
}
