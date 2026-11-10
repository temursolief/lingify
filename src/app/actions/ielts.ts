"use server";

import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { gradeIelts, TASK_SKILL, type IeltsTask } from "@/lib/ielts";

const schema = z.object({
  textId: z.string(),
  answers: z.record(z.string(), z.string().max(80)),
  seconds: z.number().int().min(0).max(4 * 3600),
});

export async function submitIelts(input: z.infer<typeof schema>) {
  const user = await requireStudent();
  const { textId, answers, seconds } = schema.parse(input);
  const text = await db.text.findFirst({ where: { id: textId, track: "ielts" } });
  if (!text?.ielts) throw new Error("IELTS passage not found");

  const graded = gradeIelts(text.ielts as IeltsTask[], answers);
  const now = new Date();
  await db.$transaction([
    db.ieltsAttempt.create({
      data: { userId: user.id, textId, answers, correct: graded.correct, total: graded.total, byType: graded.byType, seconds, band: graded.band },
    }),
    db.exerciseAttempt.createMany({
      data: graded.results.map((r) => ({
        userId: user.id,
        textId,
        kind: "COMPREHENSION" as const,
        itemKey: `${textId}:IELTS:${r.id}:${now.getTime()}`,
        skill: TASK_SKILL[r.type],
        correct: r.correct,
      })),
    }),
    db.user.update({ where: { id: user.id }, data: { lastActiveAt: now } }),
  ]);
  return graded;
}
