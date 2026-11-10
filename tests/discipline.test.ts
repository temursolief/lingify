import { describe, expect, it } from "vitest";
import { awlHeadword, awlProgress } from "../src/lib/awl";
import { addContext, MAX_CONTEXTS, pickContext } from "../src/lib/contexts";
import { estimateBand, gradeIelts, normalizeAnswer, type IeltsTask } from "../src/lib/ielts";
import { collocationQuestion } from "../src/lib/lesson";
import { maintain, MAINTENANCE_FIRST_DAYS } from "../src/lib/srs";
import { studentReminder, teacherSummary } from "../src/lib/telegram";

const now = new Date("2026-11-10T10:00:00Z");

describe("IELTS grading", () => {
  const tasks: IeltsTask[] = [
    { type: "tfng", instructions: "", items: [{ id: "q1", statement: "", answer: "NOT GIVEN", explanation: "" }] },
    { type: "headings", instructions: "", headings: ["a", "b", "c"], items: [{ id: "q2", paragraph: 1, answer: 2, explanation: "" }] },
    { type: "completion", instructions: "", maxWords: 2, items: [{ id: "q3", before: "", after: "", answers: ["meridian arc"], explanation: "" }] },
  ];
  it("checks each type and ignores case, articles and punctuation", () => {
    const r = gradeIelts(tasks, { q1: "not given", q2: "2", q3: "The Meridian Arc." });
    expect(r.correct).toBe(3);
    expect(r.byType.completion).toEqual({ correct: 1, total: 1 });
  });
  it("rejects answers over the word limit even if they contain the answer", () => {
    expect(gradeIelts(tasks, { q3: "a huge meridian arc" }).results[2].correct).toBe(false);
  });
  it("converts a scaled raw score to a band", () => {
    expect(estimateBand(13, 13)).toBe(9);
    expect(estimateBand(8, 13)).toBe(6);
    expect(estimateBand(0, 13)).toBe(2);
    expect(normalizeAnswer("  An   Apple! ")).toBe("apple");
  });
});

describe("collocationQuestion", () => {
  const phrases = [
    { phrase: "pay attention", meaning: "listen carefully" },
    { phrase: "make a decision", meaning: "decide" },
    { phrase: "depend on", meaning: "need" },
    { phrase: "in a hurry", meaning: "quickly" },
  ];
  it("blanks the verb of a verb + noun chunk and offers other verbs", () => {
    const q = collocationQuestion(phrases, 0)!;
    expect(q.question).toBe("Complete the phrase: _____ attention");
    expect(q.options[q.answer]).toBe("pay");
  });
  it("blanks the preposition of a prepositional chunk and offers prepositions", () => {
    const q = collocationQuestion(phrases, 3)!;
    expect(q.options[q.answer]).toBe("in");
    expect(q.options.every((o) => ["in", "on", "at", "for", "by", "with", "of", "to", "about", "from"].includes(o))).toBe(true);
  });
});

describe("review contexts", () => {
  it("keeps distinct sentences up to the limit and rotates through them", () => {
    let list: ReturnType<typeof addContext> = [];
    for (let i = 0; i < MAX_CONTEXTS + 2; i++) list = addContext(list, { sentence: `s${i}`, word: "w", textId: "t" });
    expect(list).toHaveLength(MAX_CONTEXTS);
    expect(addContext(list, { sentence: list[0].sentence, word: "w", textId: "t" })).toHaveLength(MAX_CONTEXTS);
    const state = { contexts: list, contextSentence: null, contextWord: null, lemma: "w" };
    expect(pickContext({ ...state, srsReviews: 0 }).sentence).not.toBe(pickContext({ ...state, srsReviews: 1 }).sentence);
  });
});

describe("check-ups for known words", () => {
  const known = { srsInterval: MAINTENANCE_FIRST_DAYS, srsEase: 2.5, srsStreak: 5, srsReviews: 5, srsLapses: 0 };
  it("spaces a passed check-up further out", () => {
    const r = maintain(known, true, now);
    expect(r.forgotten).toBe(false);
    expect(r.srsInterval).toBeGreaterThan(MAINTENANCE_FIRST_DAYS);
  });
  it("sends a forgotten word back to learning, due again within minutes", () => {
    const r = maintain(known, false, now);
    expect(r.forgotten).toBe(true);
    expect(r.srsDue!.getTime() - now.getTime()).toBeLessThan(15 * 60_000);
  });
});

describe("Academic Word List", () => {
  it("accepts American spellings of British headwords", () => {
    expect(awlHeadword("analyze")).toBe("analyse");
    expect(awlHeadword("labor")).toBe("labour");
    expect(awlProgress(new Set(["analyze", "data"])).sublists[0].known).toBe(2);
  });
});

describe("Telegram messages", () => {
  it("lists only unfinished tasks and escapes HTML", () => {
    const msg = studentReminder("Aziz <K>", [{ label: "Review", done: true }, { label: "Read one text", done: false }], ["Bread & salt"]);
    expect(msg).toContain("Hi Aziz!");
    expect(msg).not.toContain("• Review");
    expect(msg).toContain("Bread &amp; salt");
  });
  it("puts the least active students first in the teacher summary", () => {
    const msg = teacherSummary("B1", [
      { name: "A", completeDays: 7, days: 7, minutes: 200, flags: [] },
      { name: "B", completeDays: 0, days: 7, minutes: 0, flags: ["Inactive"] },
    ]);
    expect(msg.indexOf("B:")).toBeLessThan(msg.indexOf("A:"));
  });
});
