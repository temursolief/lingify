import { BAND_SIZE, bandLemmas } from "./frequency";

/** Fake English-looking words; saying "yes" to them reveals guessing. Checked against the dictionary and frequency list. */
export const PSEUDOWORDS = [
  "plinder", "mabble", "crenify", "thrastle", "dorbish", "glenter", "hobstan", "kelstic", "nostrel", "pemble",
  "quarnish", "ridgeful", "sclander", "tornate", "vintrous", "wember", "yarlish", "blenter", "fennick", "grastle",
  "hurlow", "jostrel", "kintle", "lorvish", "mornate", "nibbet", "prastle", "quellow", "rendish", "snoffle",
  "vorgal", "wospen", "flimber", "harbent", "marvish", "plunter", "sprindle", "tavish",
];

const CONTENT_POS = new Set(["NOUN", "VERB", "ADJ", "ADV"]);
const WORDS_PER_BAND = 8;
export const STAGE_ONE_BANDS = [1, 2, 3, 4, 5, 6];
export const STAGE_TWO_BANDS = [7, 8, 9, 10];
const PSEUDO_STAGE_ONE = 12;
const PSEUDO_STAGE_TWO = 6;
/** Stage two runs only if the learner still knows at least this share of band 6. */
export const STAGE_TWO_THRESHOLD = 0.5;

export type PlacementItem = { word: string; band: number | null; answer?: boolean };
export type BandResult = { band: number; known: number; total: number; corrected: number };

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sampleBand(band: number, random: () => number): string[] {
  const candidates = bandLemmas(band)
    .filter(([lemma, pos, plain]) => plain === 1 && CONTENT_POS.has(pos) && lemma.length >= 3 && !lemma.includes("'"))
    .map(([lemma]) => lemma);
  return shuffle(candidates, random).slice(0, WORDS_PER_BAND);
}

export function buildStage(stage: 1 | 2, usedPseudo: string[] = [], random = Math.random): PlacementItem[] {
  const bands = stage === 1 ? STAGE_ONE_BANDS : STAGE_TWO_BANDS;
  const real = bands.flatMap((band) => sampleBand(band, random).map((word) => ({ word, band })));
  const pseudo = shuffle(PSEUDOWORDS.filter((w) => !usedPseudo.includes(w)), random)
    .slice(0, stage === 1 ? PSEUDO_STAGE_ONE : PSEUDO_STAGE_TWO)
    .map((word) => ({ word, band: null }));
  return shuffle([...real, ...pseudo], random);
}

/** Yes/No vocabulary test scoring with the standard guessing correction: (hits - falseAlarms) / (1 - falseAlarms). */
export function scorePlacement(items: PlacementItem[]): { results: BandResult[]; falseAlarmRate: number; estimate: number } {
  const pseudo = items.filter((i) => i.band === null);
  const falseAlarmRate = pseudo.length ? pseudo.filter((i) => i.answer).length / pseudo.length : 0;
  const bands = [...new Set(items.filter((i) => i.band !== null).map((i) => i.band as number))].sort((a, b) => a - b);

  const results = bands.map((band) => {
    const bandItems = items.filter((i) => i.band === band);
    const known = bandItems.filter((i) => i.answer).length;
    const hitRate = known / bandItems.length;
    const corrected = falseAlarmRate >= 1 ? 0 : Math.max(0, Math.min(1, (hitRate - falseAlarmRate) / (1 - falseAlarmRate)));
    return { band, known, total: bandItems.length, corrected };
  });

  const estimate = Math.round(results.reduce((sum, r) => sum + r.corrected * BAND_SIZE, 0));
  return { results, falseAlarmRate, estimate };
}

export function needsStageTwo(stageOneItems: PlacementItem[]): boolean {
  const band6 = scorePlacement(stageOneItems).results.find((r) => r.band === 6);
  return (band6?.corrected ?? 0) >= STAGE_TWO_THRESHOLD;
}

/**
 * Lemmas to mark KNOWN after placement: in each tested band the most frequent share matching the corrected score,
 * plus every word the learner said yes to, minus every word they said no to.
 */
export function knownLemmasFromPlacement(items: PlacementItem[], results: BandResult[]): string[] {
  const yes = new Set(items.filter((i) => i.band !== null && i.answer).map((i) => i.word));
  const no = new Set(items.filter((i) => i.band !== null && !i.answer).map((i) => i.word));
  const known = new Set<string>(yes);
  for (const r of results) {
    const count = Math.round(r.corrected * BAND_SIZE);
    for (const [lemma] of bandLemmas(r.band).slice(0, count)) if (!no.has(lemma)) known.add(lemma);
  }
  return [...known];
}
