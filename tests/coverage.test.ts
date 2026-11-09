import { describe, expect, it } from "vitest";
import { tokenize } from "../src/lib/nlp";
import { coverageOf, levelFor } from "../src/lib/texts";

describe("tokenize", () => {
  it("maps inflected and derived forms to their word family", () => {
    const { lemmaCounts } = tokenize(["She drank tea and smiled. The children were relaxed and secretly happy."]);
    for (const lemma of ["drink", "smile", "child", "relax", "secret", "happy", "be"]) expect(lemmaCounts).toHaveProperty(lemma);
  });

  it("leaves names, nationalities and numbers out of the count", () => {
    const { lemmaCounts } = tokenize(["Marie met two African scientists in Paris on her fortieth birthday."]);
    expect(Object.keys(lemmaCounts)).not.toContain("african");
    expect(Object.keys(lemmaCounts)).not.toContain("marie");
    expect(Object.keys(lemmaCounts)).not.toContain("fortieth");
    expect(lemmaCounts).toHaveProperty("scientist");
  });

  it("keeps the first word of quoted speech", () => {
    const { lemmaCounts } = tokenize(["He smiled. “Would you like a cup of tea?” he asked."]);
    expect(lemmaCounts).toHaveProperty("would");
  });
});

describe("coverage", () => {
  it("weights by running words, not distinct words", () => {
    const { coverage, unknownLemmas } = coverageOf({ the: 18, cat: 1, ocelot: 1 }, new Set(["the", "cat"]));
    expect(coverage).toBeCloseTo(0.95);
    expect(unknownLemmas).toEqual(["ocelot"]);
  });

  it("applies the 95% and 98% thresholds", () => {
    expect(levelFor(0.949)).toBe("locked");
    expect(levelFor(0.95)).toBe("study");
    expect(levelFor(0.98)).toBe("pleasure");
  });
});
