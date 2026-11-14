import "server-only";
import { db } from "./db";

/**
 * Skill badges: tied to exam habits and mistake causes, never to time spent. Each has levels; `goal` is the next
 * level's target and `count` how far the student is.
 */
export type SkillBadge = { key: string; name: string; desc: string; count: number; goal: number; level: number; icon: "evidence" | "distractor" | "flame" | "exam" | "words" };

/** Level thresholds: reaching one starts the next. */
function levelled(count: number, steps: number[]) {
  const level = steps.filter((s) => count >= s).length;
  return { level, goal: steps[Math.min(level, steps.length - 1)] };
}

/** A card this many days apart counts as remembered for good (Lingify caps intervals at 20 days). */
const KEPT_INTERVAL = 14;

/**
 * The badges. The streak comes in as a promise so the counts query runs at the same time as the XP read that
 * provides it, instead of after it.
 */
export async function skillBadges(userId: string, bestStreakOf: Promise<number>): Promise<SkillBadge[]> {
  // All four counts in one statement, over the student's first tries that count (not retaken, not flagged).
  const [[{ evidence, distractors, clean, kept }], bestStreak] = await Promise.all([db.$queryRaw<{ evidence: number; distractors: number; clean: number; kept: number }[]>`
    WITH att AS (
      SELECT id, "submissionReason", "integrityEvents" FROM "PassageAttempt"
      WHERE "userId" = ${userId} AND "invalidatedAt" IS NULL AND "integrityFlagged" = false AND "firstSubmittedAt" IS NOT NULL
    )
    SELECT
      -- right first time with the proof in the paragraph the teacher marked, or fixed with it
      (SELECT count(*) FROM "QuestionAnswer" q WHERE q."attemptId" IN (SELECT id FROM att) AND q.correct AND q."evidenceOk" = true)::int AS evidence,
      (SELECT count(*) FROM "QuestionAnswer" q WHERE q."attemptId" IN (SELECT id FROM att) AND q.correct AND q."firstCorrect" = false AND q."errorTag" = 'DISTRACTOR')::int AS distractors,
      (SELECT count(*) FROM att WHERE "submissionReason" = 'NORMAL' AND "integrityEvents" = '[]'::jsonb)::int AS clean,
      (SELECT count(*) FROM "CardState" c WHERE c."userId" = ${userId} AND c.queue = 'REVIEW' AND c.interval >= ${KEPT_INTERVAL})::int AS kept`, bestStreakOf]);
  const badge = (key: string, name: string, desc: string, icon: SkillBadge["icon"], count: number, steps: number[]): SkillBadge => ({ key, name, desc, icon, count, ...levelled(count, steps) });
  return [
    badge("evidence", "Evidence Finder", "Answers proven in the right paragraph", "evidence", evidence, [10, 50, 150]),
    badge("distractor", "Distractor Hunter", "Distractor mistakes fixed and named", "distractor", distractors, [5, 20, 50]),
    badge("flame", "Steady Flame", "Your longest streak, in days", "flame", bestStreak, [7, 30, 100]),
    badge("exam", "Exam Ready", "First tries with no warnings or flags", "exam", clean, [5, 20, 50]),
    badge("words", "Word Keeper", "Words remembered for two weeks or more", "words", kept, [100, 300, 1000]),
  ];
}
