"use server";

import { randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireTeacher } from "@/lib/auth";
import { teacherClass } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { parsePassageJson } from "@/lib/passage-format";

export type FormState = { error?: string; errors?: string[]; ok?: string } | undefined;

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

export async function removeStudent(classId: string, studentId: string) {
  const cls = await ownClass(classId);
  await db.$transaction([
    db.assignmentRecipient.deleteMany({ where: { studentId, assignment: { classId: cls.id } } }),
    db.enrollment.deleteMany({ where: { classId: cls.id, userId: studentId } }),
  ]);
  refresh();
}

function slugify(title: string) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "passage";
  return `${base}-${randomInt(36 ** 4).toString(36)}`;
}

/** Validates the uploaded JSON against the documented format and saves it as one of the teacher's passages. */
export async function uploadPassage(_: FormState, formData: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const file = formData.get("file");
  const raw = file instanceof File && file.size ? await file.text() : String(formData.get("json") ?? "");
  if (!raw.trim()) return { error: "Choose a .json file or paste the JSON." };
  if (raw.length > 400_000) return { error: "That file is too large for one passage." };
  const parsed = parsePassageJson(raw);
  if (!parsed.ok) return { error: "The passage was not saved. Fix these points and upload again:", errors: parsed.errors };
  const { title, timeLimit, paragraphs, questionGroups } = parsed.data;
  await db.passage.create({ data: { slug: slugify(title), title, timeLimit, paragraphs, groups: questionGroups, ownerId: teacher.id } });
  refresh();
  const count = questionGroups.reduce((n, g) => n + g.questions.length, 0);
  return { ok: `“${title}” saved: ${paragraphs.length} paragraphs, ${count} questions. Assign it from a class.` };
}

export async function deletePassage(passageId: string) {
  const teacher = await requireTeacher();
  await db.passage.deleteMany({ where: { id: passageId, ownerId: teacher.id } });
  refresh();
}

const assignSchema = z.object({
  classId: z.string(),
  passageId: z.string().min(1, "Choose a passage."),
  dueAt: z.string().optional(),
  note: z.string().max(200).optional(),
});

/** Assigns a passage to the whole class or to the students ticked in the form. */
export async function assignPassage(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = assignSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([k]) => k !== "students")));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const cls = await ownClass(parsed.data.classId);
  const teacherId = cls.teacherId;
  const passage = await db.passage.findFirst({ where: { id: parsed.data.passageId, OR: [{ ownerId: null }, { ownerId: teacherId }] } });
  if (!passage) return { error: "Choose a passage." };

  const enrolled = (await db.enrollment.findMany({ where: { classId: cls.id }, select: { userId: true } })).map((e) => e.userId);
  const picked = formData.getAll("students").map(String).filter((id) => enrolled.includes(id));
  const students = picked.length ? picked : enrolled;
  if (!students.length) return { error: "This class has no students yet." };

  const dueAt = parsed.data.dueAt ? new Date(`${parsed.data.dueAt}T23:59:00`) : null;
  await db.assignment.create({
    data: {
      classId: cls.id,
      passageId: passage.id,
      note: parsed.data.note?.trim() || null,
      dueAt,
      recipients: { create: students.map((studentId) => ({ studentId })) },
    },
  });
  refresh();
  return { ok: `Assigned “${passage.title}” to ${students.length === enrolled.length ? "the whole class" : `${students.length} student${students.length === 1 ? "" : "s"}`}.` };
}

export async function deleteAssignment(assignmentId: string) {
  const teacher = await requireTeacher();
  await db.assignment.deleteMany({ where: { id: assignmentId, class: { teacherId: teacher.id } } });
  refresh();
}

export async function deleteDeck(deckId: string) {
  await requireAdmin();
  await db.deck.deleteMany({ where: { id: deckId, ownerId: null } });
  refresh();
}
