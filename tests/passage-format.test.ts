import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answerKey, EXAMPLE_PASSAGE, estimateBand, parsePassageJson, passageSchema, publicGroups } from "../src/lib/passage-format";

describe("passage upload format", () => {
  it("accepts the documented example and every built-in passage", () => {
    expect(passageSchema.safeParse(EXAMPLE_PASSAGE).success).toBe(true);
    for (const f of readdirSync("content/ielts")) {
      expect(passageSchema.safeParse(JSON.parse(readFileSync(`content/ielts/${f}`, "utf8"))).success, f).toBe(true);
    }
  });

  it("explains mistakes in plain words", () => {
    const broken = structuredClone(EXAMPLE_PASSAGE) as typeof EXAMPLE_PASSAGE;
    (broken.questionGroups[0].questions[1] as { number: number }).number = 1;
    (broken.questionGroups[1].questions[0] as { answer: string }).answer = "F";
    const r = parsePassageJson(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("Question 1 appears twice"))).toBe(true);
      expect(r.errors.some((e) => e.includes("Answer F is not one of the options"))).toBe(true);
    }
    expect(parsePassageJson("{ not json")).toMatchObject({ ok: false });
  });

  it("never sends answers to the browser", () => {
    const json = JSON.stringify(publicGroups(passageSchema.parse(EXAMPLE_PASSAGE).questionGroups));
    expect(json).not.toContain('"answer"');
    expect(json).not.toContain('"answers"');
    expect(json).not.toContain("evidence");
  });

  it("grades each question type", () => {
    const keys = new Map(answerKey(passageSchema.parse(EXAMPLE_PASSAGE).questionGroups).map((k) => [k.number, k]));
    expect(keys.get(1)!.check("true")).toBe(true);
    expect(keys.get(3)!.check("FALSE")).toBe(false);
    expect(keys.get(4)!.check("B")).toBe(true);
    expect(keys.get(6)!.check("iv")).toBe(true);
    expect(keys.get(7)!.check("C")).toBe(true);
    expect(keys.get(8)!.check("Fiber-optic")).toBe(true);
    expect(keys.get(8)!.check("fibre optic cables are")).toBe(false);
    expect(keys.get(10)!.check("a luxury")).toBe(true);
  });

  it("estimates a band from a third of the test", () => {
    expect(estimateBand(13, 13)).toBe(9);
    expect(estimateBand(8, 13)).toBe(6);
  });
});
