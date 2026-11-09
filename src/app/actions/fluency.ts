"use server";

import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Question } from "@/lib/texts";

/** Faster than this is skimming, not reading; the run is saved but not counted as a personal best. */
const MAX_READING_WPM = 500;

const schema = z.object({ textId: z.string(), seconds: z.number().int().min(5).max(3600), gistChoice: z.number().int().min(0) });

export async function saveFluencyRun(input: z.infer<typeof schema>) {
  const user = await requireStudent();
  const { textId, seconds, gistChoice } = schema.parse(input);
  const text = await db.text.findUniqueOrThrow({ where: { id: textId }, select: { wordCount: true, gist: true } });
  const wpm = text.wordCount / (seconds / 60);
  const gist = text.gist as Question | null;
  const gistCorrect = gist ? gistChoice === gist.answer : null;
  const previous = await db.fluencyRun.aggregate({ where: { userId: user.id, gistCorrect: { not: false }, wpm: { lte: MAX_READING_WPM } }, _max: { wpm: true } });
  const tooFast = wpm > MAX_READING_WPM;

  await db.$transaction([
    db.fluencyRun.create({ data: { userId: user.id, textId, seconds, wpm, gistCorrect } }),
    db.exerciseAttempt.create({ data: { userId: user.id, textId, kind: "GIST", itemKey: `${textId}:FLUENCY:${Date.now()}`, skill: "gist", correct: !!gistCorrect } }),
    db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }),
  ]);

  const best = previous._max.wpm;
  return {
    wpm: Math.round(wpm),
    gistCorrect,
    gistAnswer: gist ? gist.options[gist.answer] : null,
    tooFast,
    newBest: !tooFast && gistCorrect !== false && (best === null || wpm > best),
    previousBest: best && Math.round(best),
  };
}
