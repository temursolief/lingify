import { describe, expect, it } from "vitest";
import { BAND_SIZE, bandLemmas } from "../src/lib/frequency";
import { buildStage, knownLemmasFromPlacement, PSEUDOWORDS, scorePlacement, type PlacementItem } from "../src/lib/placement";

function answer(items: PlacementItem[], knows: (i: PlacementItem) => boolean) {
  return items.map((i) => ({ ...i, answer: knows(i) }));
}

describe("placement", () => {
  it("builds stage one from bands 1-6 plus pseudowords", () => {
    const items = buildStage(1);
    expect(items.filter((i) => i.band === null).every((i) => PSEUDOWORDS.includes(i.word))).toBe(true);
    expect(new Set(items.filter((i) => i.band !== null).map((i) => i.band))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it("estimates about 3,000 words for a learner who knows bands 1-3 and never guesses", () => {
    const items = answer(buildStage(1), (i) => i.band !== null && i.band <= 3);
    const { estimate, falseAlarmRate } = scorePlacement(items);
    expect(falseAlarmRate).toBe(0);
    expect(estimate).toBe(3 * BAND_SIZE);
  });

  it("cancels out guesses using the pseudoword false-alarm rate", () => {
    // Knows bands 1-3; says yes to every other word in bands 4-6 and to every other pseudoword.
    const seen = new Map<number | null, number>();
    const items = buildStage(1).map((i) => {
      const n = (seen.get(i.band) ?? 0) + 1;
      seen.set(i.band, n);
      return { ...i, answer: (i.band !== null && i.band <= 3) || n % 2 === 0 };
    });
    const { estimate, falseAlarmRate } = scorePlacement(items);
    expect(falseAlarmRate).toBe(0.5);
    expect(estimate).toBe(3 * BAND_SIZE);
  });

  it("gives zero to someone who says yes to everything", () => {
    expect(scorePlacement(answer(buildStage(1), () => true)).estimate).toBe(0);
  });

  it("marks the most frequent words in each band known, never ones the learner said no to", () => {
    const items = answer(buildStage(1), (i) => i.band === 1);
    const rejected = items.find((i) => i.band === 1)!;
    rejected.answer = false;
    const { results } = scorePlacement(items);
    const known = new Set(knownLemmasFromPlacement(items, results));
    expect(known.has(bandLemmas(1)[0][0])).toBe(true);
    expect(known.has(rejected.word)).toBe(false);
  });
});
