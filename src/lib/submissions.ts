import "server-only";
import { z } from "zod";
import { db } from "./db";
import { lessonVisibleTo, submitListening } from "./listening";
import { passageVisibleTo, submitFirst } from "./passages";
import { SubmissionMetaSchema } from "./telemetry";

/**
 * The first submission of a passage or lesson, as the browser sends it: from the Submit button, the timer, the
 * proctor when the student leaves the test, or (same body) the beacon to /api/attempt-terminate when the tab closes.
 */

export const evidenceSchema = z.object({ paragraph: z.number().int().min(0).max(25), start: z.number().int().min(0), end: z.number().int().min(0), text: z.string().max(1500) });

const meta = SubmissionMetaSchema.prefault({});

export const passageSubmissionSchema = z.object({
  attemptId: z.string(),
  passageId: z.string(),
  answers: z.record(z.string(), z.string().max(120)),
  evidence: z.record(z.string(), evidenceSchema),
  seconds: z.number().int().min(0).max(4 * 3600),
  meta,
});
export type PassageSubmission = z.input<typeof passageSubmissionSchema>;

export const lessonSubmissionSchema = z.object({ attemptId: z.string(), answers: z.record(z.string(), z.string().max(120)), meta });
export type LessonSubmission = z.input<typeof lessonSubmissionSchema>;

const toNumbers = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [Number(k), v]));

/** Grades a passage's first try for this student. Returns the passage ID. */
export async function submitPassageFor(userId: string, input: PassageSubmission) {
  const { attemptId, passageId, answers, evidence, seconds, meta } = passageSubmissionSchema.parse(input);
  const passage = await db.passage.findFirst({ where: { id: passageId, ...passageVisibleTo(userId) }, select: { id: true } });
  if (!passage) throw new Error("Passage not found");
  await submitFirst(userId, attemptId, toNumbers(answers), toNumbers(evidence), seconds, meta);
  return passageId;
}

/** Grades a lesson's first try for this student. */
export async function submitLessonFor(userId: string, input: LessonSubmission) {
  const { attemptId, answers, meta } = lessonSubmissionSchema.parse(input);
  const attempt = await db.listeningAttempt.findFirst({ where: { id: attemptId, userId, lesson: lessonVisibleTo(userId) }, select: { id: true } });
  if (!attempt) throw new Error("Lesson not found");
  await submitListening(userId, attemptId, answers, meta);
}
