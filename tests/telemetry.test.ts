import { describe, expect, it } from "vitest";
import {
  answerPace,
  assessFirstTry,
  AttemptTelemetrySchema,
  emptyTelemetry,
  integrityBadge,
  locatingMismatch,
  median,
  reviewSpam,
  strictestPolicy,
  SubmissionMetaSchema,
  type AttemptTelemetry,
} from "../src/lib/telemetry";

const telemetry = (answerTimes: Record<string, number>, extra: Partial<AttemptTelemetry> = {}): AttemptTelemetry => ({ ...emptyTelemetry(), answerTimes, ...extra });

/** Thirteen first answers spread `gap` seconds apart, starting `first` seconds in. */
const spread = (first: number, gap: number, n = 13) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), first + i * gap]));

describe("answer pace", () => {
  it("orders first answers by time and counts rapid guesses", () => {
    const pace = answerPace({ "1": 30, "3": 31, "2": 60, "4": 62.5 });
    expect(pace.answerOrder).toEqual([1, 3, 2, 4]);
    // 3 came 1 s after 1, 4 came 2.5 s after 2
    expect(pace.rapidGuessCount).toBe(2);
    expect(pace.maxAnswersIn15s).toBe(2);
  });

  it("finds a burst of five answers inside fifteen seconds", () => {
    expect(answerPace(spread(100, 3, 5)).maxAnswersIn15s).toBe(5);
    expect(answerPace(spread(100, 4, 5)).maxAnswersIn15s).toBe(4);
  });

  it("ignores whatever counts the browser claims", () => {
    const parsed = AttemptTelemetrySchema.parse({ answerTimes: spread(60, 60), rapidGuessCount: 99, maxAnswersIn15s: 99 });
    const a = assessFirstTry({ kind: "reading", reason: "NORMAL", telemetry: parsed, band: 6, questionCount: 13, serverSeconds: 900 });
    expect(a.telemetry.rapidGuessCount).toBe(0);
    expect(a.telemetry.maxAnswersIn15s).toBe(1);
    expect(a.flagged).toBe(false);
  });
});

describe("first-try flags", () => {
  it("flags an answer-key burst", () => {
    const a = assessFirstTry({ kind: "reading", reason: "NORMAL", telemetry: telemetry(spread(300, 2)), band: 5, questionCount: 13, serverSeconds: 900 });
    expect(a.reasons).toContain("ANSWER_KEY_SUSPECTED");
  });

  it("flags band 8+ in under a quarter of the expected time, by the server's clock", () => {
    const fast = { kind: "reading" as const, reason: "NORMAL" as const, telemetry: telemetry(spread(20, 17), { durationSec: 1500 }), band: 8.5, questionCount: 13 };
    expect(assessFirstTry({ ...fast, serverSeconds: 230 }).reasons).toEqual(expect.arrayContaining(["UNREALISTIC_SPEED_HIGH_SCORE"]));
    // The browser's 1500 s does not hide a 230 s test on the server's clock; without the server's, it is used.
    expect(assessFirstTry({ ...fast, serverSeconds: null }).reasons).not.toContain("UNREALISTIC_SPEED_HIGH_SCORE");
  });

  it("flags band 7.5 in under 3.5 minutes as an answer key", () => {
    const a = assessFirstTry({ kind: "reading", reason: "NORMAL", telemetry: telemetry(spread(20, 14)), band: 7.5, questionCount: 13, serverSeconds: 200 });
    expect(a.reasons).toContain("ANSWER_KEY_SUSPECTED");
  });

  it("does not apply reading pace rules to listening", () => {
    const a = assessFirstTry({ kind: "listening", reason: "NORMAL", telemetry: telemetry(spread(20, 14)), band: 9, questionCount: 10, serverSeconds: 120 });
    expect(a.flagged).toBe(false);
  });

  it("flags every auto-finish with its reason", () => {
    for (const reason of ["TAB_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT"] as const) {
      const a = assessFirstTry({ kind: "reading", reason, telemetry: emptyTelemetry(), band: 3, questionCount: 13, serverSeconds: 600 });
      expect(a).toMatchObject({ flagged: true, reasons: [reason] });
    }
    expect(assessFirstTry({ kind: "reading", reason: "TIMER_EXPIRED", telemetry: telemetry(spread(60, 80)), band: 5, questionCount: 13, serverSeconds: 1200 }).flagged).toBe(false);
  });
});

describe("prove-it locating mismatch", () => {
  it("needs four wrong paragraphs in a row", () => {
    expect(locatingMismatch([false, false, false, true, false])).toBe(false);
    expect(locatingMismatch([false, null, false, false, false])).toBe(true);
    expect(locatingMismatch([true, false, false, false, false])).toBe(true);
  });
});

describe("flashcard spam", () => {
  const reviews = (ms: number[], rating = 3, wasNew = false) => ms.map((durationMs) => ({ durationMs, rating, wasNew }));

  it("flags a median under 1.2 s", () => {
    expect(reviewSpam(reviews(Array(12).fill(700))).spammed).toBe(true);
    expect(reviewSpam(reviews(Array(12).fill(3500))).spammed).toBe(false);
  });

  it("flags new cards rated Easy in under 2 s", () => {
    const r = [...reviews(Array(10).fill(1500), 4, true), ...reviews(Array(20).fill(6000))];
    expect(reviewSpam(r)).toMatchObject({ spammed: true, suspicious: 0 });
  });

  it("needs enough timed reviews and skips unmeasured ones", () => {
    expect(reviewSpam(reviews(Array(5).fill(300))).spammed).toBe(false);
    expect(reviewSpam(reviews(Array(30).fill(0))).timed).toBe(0);
  });

  it("takes the median", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe("badges and policies", () => {
  it("is red for flags, amber for warnings, green otherwise", () => {
    const base = { kind: "reading" as const, submitted: true, reason: "NORMAL", reasons: [], events: [], telemetry: {}, seconds: 900 };
    expect(integrityBadge(base).tone).toBe("clean");
    expect(integrityBadge({ ...base, events: [{ type: "WINDOW_BLUR", atMs: 1000 }] }).tone).toBe("warn");
    expect(integrityBadge({ ...base, seconds: 300 }).tone).toBe("warn");
    const red = integrityBadge({ ...base, reason: "TAB_HIDDEN", reasons: ["TAB_HIDDEN"], events: [{ type: "TAB_HIDDEN", atMs: 125_000 }], telemetry: { answerTimes: { "1": 30, "2": 100, "3": 200 } } });
    expect(red.tone).toBe("flagged");
    expect(red.details.join(" ")).toContain("at 2:05 with 2 answered");
  });

  it("applies the strictest policy and parses an empty submission", () => {
    expect(strictestPolicy(["NONE", "WARN_ONCE"])).toBe("WARN_ONCE");
    expect(strictestPolicy([])).toBe("NONE");
    expect(SubmissionMetaSchema.parse({})).toMatchObject({ reason: "NORMAL", events: [], telemetry: { answerOrder: [] } });
    expect(SubmissionMetaSchema.safeParse({ events: [{ type: "HACK", atMs: 1 }] }).success).toBe(false);
  });
});
