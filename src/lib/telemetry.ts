import { z } from "zod";

/**
 * Test integrity and pacing: the shapes the browser sends with a first submission, and the pure rules that turn them
 * into flags for the teacher. Shared by the browser (collecting) and the server (validating and judging), so nothing
 * here touches the database or the DOM.
 *
 * The browser's own counts are never trusted for a flag: the server recomputes answer order, rapid guesses and bursts
 * from the raw first-answer times, and uses its own clock for the test's length when it has one.
 */

export const SUBMISSION_REASONS = ["NORMAL", "TIMER_EXPIRED", "TAB_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT"] as const;
export type SubmissionReason = (typeof SUBMISSION_REASONS)[number];
/** Reasons that mean the test was finished for the student because they left it. */
export const AUTO_FINISH_REASONS: readonly SubmissionReason[] = ["TAB_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT"];
export const isAutoFinish = (r: string) => (AUTO_FINISH_REASONS as readonly string[]).includes(r);

export type ProctoringPolicy = "NONE" | "WARN_ONCE" | "STRICT";
/** Strictest first: when a passage is assigned twice with different rules, the strictest one applies. */
export const POLICY_ORDER: readonly ProctoringPolicy[] = ["STRICT", "WARN_ONCE", "NONE"];
export const POLICY_LABEL: Record<ProctoringPolicy, string> = {
  STRICT: "Strict lock: leaving the test submits it",
  WARN_ONCE: "One warning, then the test is submitted",
  NONE: "Practice: record tab switches, never submit",
};

export function strictestPolicy(policies: ProctoringPolicy[]): ProctoringPolicy {
  return POLICY_ORDER.find((p) => policies.includes(p)) ?? "NONE";
}

export const EVENT_TYPES = ["FULLSCREEN_EXIT", "TAB_HIDDEN", "WINDOW_BLUR", "PASTE", "COPY", "FIND_KEY", "DEVTOOLS_KEY", "NO_FULLSCREEN"] as const;
export type IntegrityEventType = (typeof EVENT_TYPES)[number];
/** Events that mean the student's attention left the test. */
export const FOCUS_EVENTS: readonly IntegrityEventType[] = ["FULLSCREEN_EXIT", "TAB_HIDDEN", "WINDOW_BLUR"];

const SIX_HOURS_SEC = 6 * 3600;
const questionKey = z.string().regex(/^\d{1,3}$/);
/** A record keyed by question number, at most 200 of them. */
const perQuestion = <T extends z.ZodType>(value: T) =>
  z.record(questionKey, value).refine((r) => Object.keys(r).length <= 200, "too many questions");

export const IntegrityEventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  /** milliseconds since the test started */
  atMs: z.number().int().min(0).max(SIX_HOURS_SEC * 1000),
  questionNumber: z.number().int().min(0).max(999).optional(),
});
export type IntegrityEvent = z.infer<typeof IntegrityEventSchema>;
export const IntegrityEventsSchema = z.array(IntegrityEventSchema).max(300);

export const AttemptTelemetrySchema = z.object({
  /** active seconds from "Start test" to submission, by the browser's clock */
  durationSec: z.number().int().min(0).max(SIX_HOURS_SEC).default(0),
  /** question numbers in the order they were first answered (recomputed on the server from answerTimes) */
  answerOrder: z.array(z.number().int().min(0).max(999)).max(200).default([]),
  /** seconds spent on each question: focus or selection inside it, visible tab only */
  perQuestionSec: perQuestion(z.number().min(0).max(SIX_HOURS_SEC)).default({}),
  /** seconds from the start to each question's first answer */
  answerTimes: perQuestion(z.number().min(0).max(SIX_HOURS_SEC)).default({}),
  /** how many times each answer was changed */
  changeCounts: perQuestion(z.number().int().min(0).max(10_000)).default({}),
  /** first answers given less than RAPID_GUESS_SEC after the previous one (recomputed on the server) */
  rapidGuessCount: z.number().int().min(0).max(999).default(0),
  /** most first answers given inside any BURST_WINDOW_SEC (recomputed on the server) */
  maxAnswersIn15s: z.number().int().min(0).max(999).default(0),
  /** Listening only: from the YouTube player */
  audioSeekCount: z.number().int().min(0).max(100_000).optional(),
  audioPauseCount: z.number().int().min(0).max(100_000).optional(),
  playbackRateChanges: z.number().int().min(0).max(100_000).optional(),
});
export type AttemptTelemetry = z.infer<typeof AttemptTelemetrySchema>;
export const emptyTelemetry = (): AttemptTelemetry => AttemptTelemetrySchema.parse({});

/** What a first submission carries besides the answers. */
export const SubmissionMetaSchema = z.object({
  reason: z.enum(SUBMISSION_REASONS).default("NORMAL"),
  events: IntegrityEventsSchema.default([]),
  telemetry: AttemptTelemetrySchema.default(emptyTelemetry),
});
export type SubmissionMeta = z.infer<typeof SubmissionMetaSchema>;
export type SubmissionMetaInput = z.input<typeof SubmissionMetaSchema>;

// Thresholds. They are signals for a teacher to look at, not proof: each is shown with its reason.
export const RAPID_GUESS_SEC = 4;
export const BURST_WINDOW_SEC = 15;
export const BURST_COUNT = 5;
/** Roughly 1 minute 12 seconds per IELTS reading question (an hour for 40 questions, plus transfer time saved). */
export const EXPECTED_SEC_PER_QUESTION = 72;
/** Band 8+ in under a quarter of the expected time: under 4 minutes for 13 questions. */
export const UNREALISTIC_SHARE = 0.25;
/** Band 7.5+ in under 3.5 minutes. */
export const FAST_HIGH_BAND = 7.5;
export const FAST_HIGH_BAND_SEC = 210;
/** A reading first try shorter than this is "fast" (amber) even when nothing else is wrong. */
export const REALISTIC_READING_SEC = 8 * 60;
/** Wrong-paragraph proofs in a row during "Prove it" that suggest the answers did not come from the passage. */
export const LOCATING_MISMATCH_RUN = 4;
/** Flashcards: a median below this, card shown → rating, is not real study. */
export const SPAM_MEDIAN_MS = 1200;
export const SPAM_EASY_MS = 2000;
export const SPAM_EASY_SHARE = 0.85;
/** Too few reviews say nothing about speed. */
export const SPAM_MIN_REVIEWS = 10;

export type IntegrityReason =
  | "TAB_HIDDEN"
  | "WINDOW_BLUR"
  | "FULLSCREEN_EXIT"
  | "ANSWER_KEY_SUSPECTED"
  | "UNREALISTIC_SPEED_HIGH_SCORE"
  | "LOCATING_SKILL_MISMATCH";

export const REASON_LABEL: Record<IntegrityReason | "VOCAB_SPAMMED", string> = {
  TAB_HIDDEN: "Left the test tab",
  WINDOW_BLUR: "Switched to another window",
  FULLSCREEN_EXIT: "Exited fullscreen",
  ANSWER_KEY_SUSPECTED: "Answers entered too fast (answer key?)",
  UNREALISTIC_SPEED_HIGH_SCORE: "High band in unrealistic time",
  LOCATING_SKILL_MISMATCH: "Can't locate the answers they got right",
  VOCAB_SPAMMED: "Flashcards clicked through too fast",
};

/** The order of first answers, how many came too quickly after the previous one, and the densest burst. */
export function answerPace(answerTimes: Record<string, number>) {
  const firsts = Object.entries(answerTimes)
    .map(([n, sec]) => ({ n: Number(n), sec }))
    .sort((a, b) => a.sec - b.sec || a.n - b.n);
  let rapidGuessCount = 0;
  let maxAnswersIn15s = 0;
  let from = 0;
  firsts.forEach((f, i) => {
    const previous = i === 0 ? 0 : firsts[i - 1].sec;
    if (f.sec - previous < RAPID_GUESS_SEC) rapidGuessCount++;
    while (f.sec - firsts[from].sec > BURST_WINDOW_SEC) from++;
    maxAnswersIn15s = Math.max(maxAnswersIn15s, i - from + 1);
  });
  return { answerOrder: firsts.map((f) => f.n), rapidGuessCount, maxAnswersIn15s };
}

export type Assessment = { flagged: boolean; reasons: IntegrityReason[]; telemetry: AttemptTelemetry; seconds: number };

/**
 * The flags for a first submission. `serverSeconds` is the test's length by the server's clock ("Start test" to
 * submission) and wins over the browser's when present.
 */
export function assessFirstTry(input: {
  kind: "reading" | "listening";
  reason: SubmissionReason;
  telemetry: AttemptTelemetry;
  band: number;
  questionCount: number;
  serverSeconds?: number | null;
}): Assessment {
  const pace = answerPace(input.telemetry.answerTimes);
  const telemetry: AttemptTelemetry = { ...input.telemetry, ...pace };
  const seconds = input.serverSeconds ?? input.telemetry.durationSec;
  const reasons: IntegrityReason[] = [];
  if (isAutoFinish(input.reason)) reasons.push(input.reason as IntegrityReason);
  const fastHighBand = input.kind === "reading" && input.band >= FAST_HIGH_BAND && seconds < FAST_HIGH_BAND_SEC;
  if (pace.maxAnswersIn15s >= BURST_COUNT || fastHighBand) reasons.push("ANSWER_KEY_SUSPECTED");
  const expected = input.questionCount * EXPECTED_SEC_PER_QUESTION;
  if (input.kind === "reading" && input.band >= 8 && seconds < expected * UNREALISTIC_SHARE) reasons.push("UNREALISTIC_SPEED_HIGH_SCORE");
  return { flagged: reasons.length > 0, reasons, telemetry, seconds };
}

/**
 * "Prove it" in order: true = the highlight was in the paragraph the teacher marked, false = another paragraph,
 * null = the question has no evidence paragraph. A run of wrong paragraphs is a mismatch.
 */
export function locatingMismatch(proofs: (boolean | null)[]): boolean {
  let run = 0;
  for (const ok of proofs) {
    if (ok === false) run++;
    else if (ok === true) run = 0;
    if (run >= LOCATING_MISMATCH_RUN) return true;
  }
  return false;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export type ReviewSample = { durationMs: number; rating: number; wasNew: boolean };

/**
 * The clicked-through rule, from counts (so the database can do the counting): a median under 1.2 s per card, or
 * more than 85% of new cards rated Easy in under 2 s. Needs at least 10 timed reviews to say anything.
 */
export function isSpam(c: { timed: number; medianMs: number | null; newTimed: number; newEasyFast: number }) {
  return (
    (c.timed >= SPAM_MIN_REVIEWS && c.medianMs !== null && c.medianMs < SPAM_MEDIAN_MS) ||
    (c.newTimed >= SPAM_MIN_REVIEWS && c.newEasyFast / c.newTimed > SPAM_EASY_SHARE)
  );
}

/** Whether flashcard reviews look clicked through rather than studied. Reviews with no measured time are skipped. */
export function reviewSpam(reviews: ReviewSample[]) {
  const timed = reviews.filter((r) => r.durationMs > 0);
  const mid = median(timed.map((r) => r.durationMs));
  const newOnes = timed.filter((r) => r.wasNew);
  const easyFast = newOnes.filter((r) => r.rating === 4 && r.durationMs < SPAM_EASY_MS).length;
  const suspicious = timed.filter((r) => r.durationMs < SPAM_MEDIAN_MS).length;
  const spammed = isSpam({ timed: timed.length, medianMs: mid, newTimed: newOnes.length, newEasyFast: easyFast });
  return { timed: timed.length, medianMs: mid, suspicious, spammed };
}

export type BadgeTone = "clean" | "warn" | "flagged" | "none";
export type Badge = { tone: BadgeTone; label: string; details: string[] };

/** The teacher's badge for one attempt: green, amber or red, with the reasons spelled out. */
export function integrityBadge(a: {
  kind: "reading" | "listening";
  submitted: boolean;
  reason: string;
  reasons: string[];
  events: IntegrityEvent[];
  telemetry: Partial<AttemptTelemetry>;
  seconds: number | null;
}): Badge {
  if (!a.submitted) return { tone: "none", label: "Not submitted", details: [] };
  const details: string[] = a.reasons.map((r) => REASON_LABEL[r as IntegrityReason] ?? r);
  const focus = a.events.filter((e) => (FOCUS_EVENTS as readonly string[]).includes(e.type));
  if (a.reasons.length) {
    if (isAutoFinish(a.reason)) {
      const at = focus.find((e) => e.type === a.reason)?.atMs;
      const answered = at === undefined ? null : Object.values(a.telemetry.answerTimes ?? {}).filter((s) => s * 1000 <= at).length;
      details.push(`Auto-finished${at !== undefined ? ` at ${clock(at / 1000)}` : ""}${answered !== null ? ` with ${answered} answered` : ""}`);
    }
    return { tone: "flagged", label: isAutoFinish(a.reason) ? "Auto-finished" : "Flagged", details };
  }
  const warn: string[] = [];
  if (focus.length) warn.push(`${focus.length} focus warning${focus.length === 1 ? "" : "s"}`);
  const pastes = a.events.filter((e) => e.type === "PASTE").length;
  if (pastes) warn.push(`${pastes} paste${pastes === 1 ? "" : "s"}`);
  if ((a.telemetry.rapidGuessCount ?? 0) >= 3) warn.push(`${a.telemetry.rapidGuessCount} answers under ${RAPID_GUESS_SEC}s`);
  if (a.kind === "reading" && a.seconds !== null && a.seconds > 0 && a.seconds < REALISTIC_READING_SEC) warn.push(`Finished in ${clock(a.seconds)}`);
  if (warn.length) return { tone: "warn", label: "Check", details: warn };
  return { tone: "clean", label: "Clean", details: a.seconds ? [`${clock(a.seconds)} in test`] : [] };
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
