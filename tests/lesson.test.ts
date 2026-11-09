import { describe, expect, it } from "vitest";
import { guessOptions } from "../src/lib/glossary";
import { GRAMMAR_SEQUENCE, isPreview, readyStage } from "../src/lib/grammar-sequence";
import { phraseQuestion } from "../src/lib/lesson";
import { findMarks } from "../src/lib/marks";
import { tokenize } from "../src/lib/nlp";

describe("findMarks", () => {
  const { paragraphs } = tokenize(["She did not give up. Later she wanted to give up again.", "I haven't done that since I was a kid."]);
  it("finds every occurrence aligned to whole tokens", () => {
    const marks = findMarks(paragraphs, "give up");
    expect(marks).toHaveLength(2);
    const [m] = marks;
    expect(paragraphs[m.p].slice(m.from, m.to + 1).map((t) => t.v)).toEqual(["give", "up"]);
  });
  it("matches across contractions that the tokenizer splits", () => {
    expect(findMarks(paragraphs, "haven't done")).toHaveLength(1);
  });
  it("does not match inside other words", () => {
    expect(findMarks(paragraphs, "give u")).toHaveLength(0);
  });
});

describe("guessOptions", () => {
  it("returns three distinct options that include the right definition, in a stable order", () => {
    const a = guessOptions("wallet")!;
    expect(a.options).toHaveLength(3);
    expect(new Set(a.options).size).toBe(3);
    expect(a.options[a.answer]).toMatch(/money and cards/);
    expect(guessOptions("wallet")).toEqual(a);
  });
  it("returns null for words without a glossary entry", () => expect(guessOptions("the")).toBeNull());
});

describe("phraseQuestion", () => {
  const phrases = [
    { phrase: "give up", meaning: "stop trying" },
    { phrase: "in a row", meaning: "one after another" },
    { phrase: "as hard as you can", meaning: "with all your strength" },
  ];
  it("uses the other phrases' meanings as options and points at the right one", () => {
    const q = phraseQuestion(phrases, 1);
    expect(q.options).toHaveLength(3);
    expect(q.options[q.answer]).toBe("one after another");
  });
});

describe("grammar sequence", () => {
  it("starts everyone at stage 1", () => expect(readyStage(new Set())).toBe(1));
  it("moves on when most of a stage is mastered", () => {
    const stage1 = GRAMMAR_SEQUENCE.filter((g) => g.stage === 1).map((g) => g.key);
    expect(readyStage(new Set(stage1.slice(0, 3)))).toBe(2);
    expect(readyStage(new Set(stage1.slice(0, 1)))).toBe(1);
  });
  it("treats structures two or more stages ahead as a preview", () => {
    expect(isPreview("reported-speech", 1)).toBe(true);
    expect(isPreview("first-conditional", 1)).toBe(false);
  });
});
