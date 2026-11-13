"use server";

import { randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireTeacher } from "@/lib/auth";
import type { ProctoringPolicy } from "@/generated/prisma/client";
import { teacherClass } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { parsePassageJson } from "@/lib/passage-format";
import { appUrl, sendMessage } from "@/lib/telegram";
import { endOfDayOn } from "@/lib/time";

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

/** One passage file may be this long. The whole request stays well under the 1 MB limit for form actions. */
const MAX_PASSAGE_CHARS = 400_000;

/**
 * Validates one passage JSON against the documented format and saves it as one of the teacher's passages.
 * The upload form sends its files one at a time and refreshes the list once at the end, so many files can be
 * uploaded in one go without one large request.
 */
export async function uploadPassage(raw: string): Promise<FormState> {
  const teacher = await requireTeacher();
  if (typeof raw !== "string" || !raw.trim()) return { error: "Choose a .json file or paste the JSON." };
  if (raw.length > MAX_PASSAGE_CHARS) return { error: "That file is too large for one passage." };
  const parsed = parsePassageJson(raw);
  if (!parsed.ok) return { error: "Not saved. Fix these points and upload again:", errors: parsed.errors };
  const { title, timeLimit, paragraphs, questionGroups } = parsed.data;
  // The same file chosen twice (easy to do with many files) must not make a second copy.
  const same = await db.passage.findFirst({ where: { ownerId: teacher.id, archivedAt: null, title: { equals: title, mode: "insensitive" } }, select: { id: true } });
  if (same) return { error: `You already have a passage called “${title}”. Delete it first if you want to replace it.` };
  const questionCount = questionGroups.reduce((n, g) => n + g.questions.length, 0);
  await db.passage.create({
    data: { slug: slugify(title), title, timeLimit, paragraphs, groups: questionGroups, paragraphCount: paragraphs.length, questionCount, ownerId: teacher.id },
  });
  return { ok: `“${title}” saved: ${paragraphs.length} paragraphs, ${questionCount} questions.` };
}

/**
 * "Delete" archives: the passage disappears from lists, assignments and students' decks, but every attempt, the
 * passage's deck, students' own cards and their review history are kept (deleting used to cascade through all of it).
 */
export async function deletePassage(passageId: string) {
  const teacher = await requireTeacher();
  if (typeof passageId !== "string") return;
  const now = new Date();
  const archived = await db.passage.updateMany({ where: { id: passageId, ownerId: teacher.id, archivedAt: null }, data: { archivedAt: now } });
  if (archived.count) await db.deck.updateMany({ where: { passageId, archivedAt: null }, data: { archivedAt: now } });
  refresh();
}

const assignSchema = z.object({
  classId: z.string(),
  dueAt: z.string().optional(),
  note: z.string().max(200).optional(),
  proctoringPolicy: z.enum(["STRICT", "WARN_ONCE", "NONE"]).default("STRICT"),
  // An unticked checkbox sends nothing.
  requireVocabFirst: z.literal("on").optional(),
});

/**
 * Assigns a passage or a lesson to the whole class or to the students ticked in the form, with its due date, note,
 * proctoring rule and vocabulary requirement. One code path for both kinds of homework.
 */
async function assign(formData: FormData, content: "passage" | "lesson"): Promise<FormState> {
  const idField = content === "passage" ? "passageId" : "lessonId";
  const fields = Object.fromEntries([...formData.entries()].filter(([k]) => k !== "students"));
  const parsed = assignSchema.extend({ [idField]: z.string().min(1, content === "passage" ? "Choose a passage." : "Choose a lesson.") }).safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data as z.infer<typeof assignSchema> & Record<string, string>;
  const dueAt = data.dueAt ? endOfDayOn(data.dueAt) : null;
  if (data.dueAt && !dueAt) return { error: "Choose a real due date." };
  const cls = await ownClass(data.classId);
  const item =
    content === "passage"
      ? await db.passage.findFirst({ where: { id: data[idField], archivedAt: null, OR: [{ ownerId: null }, { ownerId: cls.teacherId }] }, select: { id: true, title: true } })
      : await db.listeningLesson.findFirst({ where: { id: data[idField], archivedAt: null }, select: { id: true, title: true } });
  if (!item) return { error: content === "passage" ? "Choose a passage." : "Choose a lesson." };

  const enrolled = (await db.enrollment.findMany({ where: { classId: cls.id }, select: { userId: true } })).map((e) => e.userId);
  const picked = formData.getAll("students").map(String).filter((id) => enrolled.includes(id));
  const students = picked.length ? picked : enrolled;
  if (!students.length) return { error: "This class has no students yet." };

  await db.assignment.create({
    data: {
      classId: cls.id,
      ...(content === "passage" ? { passageId: item.id } : { lessonId: item.id }),
      note: data.note?.trim() || null,
      dueAt,
      proctoringPolicy: data.proctoringPolicy as ProctoringPolicy,
      requireVocabFirst: data.requireVocabFirst === "on",
      recipients: { create: students.map((studentId) => ({ studentId })) },
    },
  });
  refresh();
  return { ok: `Assigned “${item.title}” to ${students.length === enrolled.length ? "the whole class" : `${students.length} student${students.length === 1 ? "" : "s"}`}.` };
}

export async function assignPassage(_: FormState, formData: FormData): Promise<FormState> {
  return assign(formData, "passage");
}

export async function assignLesson(_: FormState, formData: FormData): Promise<FormState> {
  return assign(formData, "lesson");
}

export async function deleteAssignment(assignmentId: string) {
  const teacher = await requireTeacher();
  await db.assignment.deleteMany({ where: { id: assignmentId, class: { teacherId: teacher.id } } });
  refresh();
}

/**
 * "Require retake": the teacher sets aside a student's first try (flagged, or for any reason). The old attempt is
 * kept for the record but no longer counts; the student starts a fresh, proctored attempt (never a practice run),
 * and the homework in this teacher's classes goes back to not started.
 */
export async function resetAttemptForRetake(input: { kind: "passage" | "lesson"; attemptId: string }) {
  const teacher = await requireTeacher();
  const { kind, attemptId } = z.object({ kind: z.enum(["passage", "lesson"]), attemptId: z.string() }).parse(input);
  const attempt =
    kind === "passage"
      ? await db.passageAttempt.findFirst({ where: { id: attemptId, invalidatedAt: null, firstSubmittedAt: { not: null } }, select: { userId: true, passageId: true, total: true } })
      : await db.listeningAttempt.findFirst({ where: { id: attemptId, invalidatedAt: null, firstSubmittedAt: { not: null } }, select: { userId: true, lessonId: true } });
  if (!attempt) return { error: "That attempt was already reset or never submitted." };
  const content = "passageId" in attempt ? { passageId: attempt.passageId } : { lessonId: attempt.lessonId };
  // Only a teacher who gave this student this homework, in one of their own classes.
  const mine = { studentId: attempt.userId, assignment: { ...content, class: { teacherId: teacher.id } } };
  if (!(await db.assignmentRecipient.findFirst({ where: mine, select: { assignmentId: true } }))) return { error: "This student's homework is not in one of your classes." };

  const now = new Date();
  await db.$transaction([
    "passageId" in attempt
      ? db.passageAttempt.update({ where: { id: attemptId }, data: { invalidatedAt: now } })
      : db.listeningAttempt.update({ where: { id: attemptId }, data: { invalidatedAt: now } }),
    "passageId" in attempt
      ? db.passageAttempt.create({ data: { userId: attempt.userId, passageId: attempt.passageId, total: attempt.total } })
      : db.listeningAttempt.create({ data: { userId: attempt.userId, lessonId: attempt.lessonId } }),
    db.assignmentRecipient.updateMany({ where: mine, data: { completedAt: null, firstSubmitAt: null, integrityFlagged: false } }),
  ]);
  refresh();
  return { ok: "Retake required. The student will see a fresh, proctored test." };
}

/** Archived like passages: students' review history on the deck is kept. */
export async function deleteDeck(deckId: string) {
  await requireAdmin();
  await db.deck.updateMany({ where: { id: deckId, ownerId: null, passageId: null, lessonId: null, archivedAt: null }, data: { archivedAt: new Date() } });
  refresh();
}

/** Turns the class's weekly XP league on or off. The shared class goal stays either way. */
export async function setLeague(classId: string, on: boolean) {
  const cls = await ownClass(classId);
  await db.class.update({ where: { id: cls.id }, data: { leagueEnabled: z.boolean().parse(on) } });
  refresh();
}

/**
 * A friendly Telegram nudge from the teacher to one of their students: open homework is waiting. Only for a student
 * in one of this teacher's classes, and only if they linked Telegram; nothing else is sent anywhere.
 */
export async function nudgeStudent(studentId: string): Promise<{ ok?: string; error?: string }> {
  const teacher = await requireTeacher();
  const student = await db.user.findFirst({
    where: { id: z.string().parse(studentId), enrollments: { some: { class: { teacherId: teacher.id } } } },
    select: { name: true, telegramChatId: true },
  });
  if (!student) return { error: "This student is not in one of your classes." };
  if (!student.telegramChatId) return { error: `${student.name.split(/\s+/)[0]} has not linked Telegram yet.` };
  const sent = await sendMessage(
    student.telegramChatId,
    // Sent as Telegram HTML: the teacher's name is escaped.
    `${teacher.name.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)} is thinking of you: your Lingify homework is waiting. One small step today keeps your streak going.\n${appUrl("/student")}`,
  );
  return sent ? { ok: "Nudge sent on Telegram" } : { error: "Telegram did not take the message. Try again later." };
}
