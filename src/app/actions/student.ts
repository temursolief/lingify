"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";

export type FormState = { error?: string; ok?: string } | undefined;

export async function joinClass(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStudent();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "Enter the code your teacher gave you." };
  const cls = await db.class.findUnique({ where: { joinCode: code } });
  if (!cls) return { error: "No class found with that code." };

  await db.enrollment.upsert({
    where: { userId_classId: { userId: user.id, classId: cls.id } },
    create: { userId: user.id, classId: cls.id },
    update: {},
  });
  const goalAssignments = await db.assignment.findMany({ where: { classId: cls.id, kind: "GOAL" }, select: { id: true } });
  await db.assignmentRecipient.createMany({
    data: goalAssignments.map((a) => ({ assignmentId: a.id, studentId: user.id })),
    skipDuplicates: true,
  });
  refresh();
  return { ok: `You joined ${cls.name}.` };
}

const goalSchema = z.object({
  type: z.enum(["WORDS_WEEK", "TEXTS_WEEK", "MINUTES_WEEK"]),
  target: z.coerce.number().int().min(1).max(100_000),
});

export async function setGoal(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStudent();
  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a goal and a number above zero." };
  await db.$transaction([
    db.goal.updateMany({ where: { userId: user.id, type: parsed.data.type, active: true }, data: { active: false } }),
    db.goal.create({ data: { userId: user.id, ...parsed.data } }),
  ]);
  refresh();
  return { ok: "Goal saved." };
}

export async function removeGoal(goalId: string) {
  const user = await requireStudent();
  await db.goal.updateMany({ where: { id: goalId, userId: user.id }, data: { active: false } });
  refresh();
}

export async function setUzbekGlosses(on: boolean) {
  const user = await requireStudent();
  await db.user.update({ where: { id: user.id }, data: { uzbekGlosses: z.boolean().parse(on) } });
}
