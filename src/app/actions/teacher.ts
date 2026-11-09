"use server";

import { randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth";
import { teacherClass } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { coverageOf, MIN_COVERAGE, type LemmaCounts } from "@/lib/texts";
import { wordSets } from "@/lib/vocab";

export type FormState = { error?: string; ok?: string; skipped?: { name: string; coverage: number }[] } | undefined;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function joinCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export async function createClass(_: FormState, formData: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { error: "Give the class a name (2–80 characters)." };
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = joinCode();
    if (await db.class.findUnique({ where: { joinCode: code } })) continue;
    await db.class.create({ data: { name, joinCode: code, teacherId: teacher.id } });
    refresh();
    return { ok: `Class created. Join code: ${code}` };
  }
  return { error: "Could not create a unique code. Please try again." };
}

async function ownClass(classId: string) {
  const teacher = await requireTeacher();
  const cls = await teacherClass(classId, teacher.id);
  if (!cls) throw new Error("Class not found");
  return cls;
}

/** Assigns a text only to students who already know at least 95% of its words; the rest are reported back. */
export async function assignText(_: FormState, formData: FormData): Promise<FormState> {
  const cls = await ownClass(String(formData.get("classId")));
  const textId = String(formData.get("textId") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;
  const text = await db.text.findUnique({ where: { id: textId } });
  if (!text) return { error: "Choose a text." };

  const students = await db.enrollment.findMany({ where: { classId: cls.id }, include: { user: { select: { id: true, name: true } } } });
  if (!students.length) return { error: "This class has no students yet." };

  const eligible: string[] = [];
  const skipped: { name: string; coverage: number }[] = [];
  for (const { user } of students) {
    const { known } = await wordSets(user.id);
    const { coverage } = coverageOf(text.lemmaCounts as LemmaCounts, known);
    if (coverage >= MIN_COVERAGE) eligible.push(user.id);
    else skipped.push({ name: user.name, coverage });
  }
  if (!eligible.length) return { error: `“${text.title}” is above every student's current level, so it was not assigned.`, skipped };

  await db.assignment.create({
    data: {
      classId: cls.id,
      kind: "TEXT",
      textId: text.id,
      note,
      recipients: { create: eligible.map((studentId) => ({ studentId })) },
    },
  });
  refresh();
  return { ok: `Assigned “${text.title}” to ${eligible.length} student${eligible.length === 1 ? "" : "s"}.`, skipped };
}

const goalSchema = z.object({
  classId: z.string(),
  goalType: z.enum(["WORDS_WEEK", "TEXTS_WEEK", "MINUTES_WEEK"]),
  target: z.coerce.number().int().min(1).max(100_000),
  note: z.string().max(200).optional(),
});

export async function assignGoal(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a goal type and a target above zero." };
  const cls = await ownClass(parsed.data.classId);
  const students = await db.enrollment.findMany({ where: { classId: cls.id }, select: { userId: true } });
  await db.assignment.create({
    data: {
      classId: cls.id,
      kind: "GOAL",
      goalType: parsed.data.goalType,
      target: parsed.data.target,
      note: parsed.data.note?.trim() || null,
      recipients: { create: students.map((s) => ({ studentId: s.userId })) },
    },
  });
  refresh();
  return { ok: "Weekly goal set for the class." };
}

export async function deleteAssignment(assignmentId: string) {
  const teacher = await requireTeacher();
  await db.assignment.deleteMany({ where: { id: assignmentId, class: { teacherId: teacher.id } } });
  refresh();
}

export async function removeStudent(classId: string, studentId: string) {
  const cls = await ownClass(classId);
  await db.$transaction([
    db.assignmentRecipient.deleteMany({ where: { studentId, assignment: { classId: cls.id } } }),
    db.enrollment.deleteMany({ where: { classId: cls.id, userId: studentId } }),
  ]);
  refresh();
}
