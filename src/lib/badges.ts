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

export async function skillBadges(userId: string, bestStreak: number): Promise<SkillBadge[]> {
  const counted = { userId, invalidatedAt: null, integrityFlagged: false, firstSubmittedAt: { not: null } };
  const [evidence, distractors, clean, kept] = await Promise.all([
    // Right first time with the proof in the paragraph the teacher marked, or fixed with it.
    db.questionAnswer.count({ where: { correct: true, evidenceOk: true, attempt: counted } }),
    db.questionAnswer.count({ where: { correct: true, firstCorrect: false, errorTag: "DISTRACTOR", attempt: counted } }),
    db.passageAttempt.count({ where: { ...counted, submissionReason: "NORMAL", integrityEvents: { equals: [] } } }),
    db.cardState.count({ where: { userId, queue: "REVIEW", interval: { gte: KEPT_INTERVAL } } }),
  ]);
  const badge = (key: string, name: string, desc: string, icon: SkillBadge["icon"], count: number, steps: number[]): SkillBadge => ({ key, name, desc, icon, count, ...levelled(count, steps) });
  return [
    badge("evidence", "Evidence Finder", "Answers proven in the right paragraph", "evidence", evidence, [10, 50, 150]),
    badge("distractor", "Distractor Hunter", "Distractor mistakes fixed and named", "distractor", distractors, [5, 20, 50]),
    badge("flame", "Steady Flame", "Your longest streak, in days", "flame", bestStreak, [7, 30, 100]),
    badge("exam", "Exam Ready", "First tries with no warnings or flags", "exam", clean, [5, 20, 50]),
    badge("words", "Word Keeper", "Words remembered for two weeks or more", "words", kept, [100, 300, 1000]),
  ];
}
