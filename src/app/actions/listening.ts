"use server";

import { randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureLessonDeck, lessonVisibleTo, markVocabSeen, retryListening, submitListening, viewOf, type ListeningView } from "@/lib/listening";
import { parseListeningJson } from "@/lib/listening-format";
import { answerKey, youtubeId } from "@/lib/passage-format";
import type { FormState } from "./teacher";

async function view(userId: string, attemptId: string): Promise<ListeningView> {
  const a = await db.listeningAttempt.findFirstOrThrow({ where: { id: attemptId, userId }, include: { lesson: { select: { total: true } } } });
  return viewOf(a, a.lesson.total);
}

const submitSchema = z.object({ attemptId: z.string(), answers: z.record(z.string(), z.string().max(120)) });

export async function submitLesson(input: z.infer<typeof submitSchema>): Promise<ListeningView> {
  const user = await requireStudent();
  const { attemptId, answers } = submitSchema.parse(input);
  await submitListening(user.id, attemptId, answers);
  return view(user.id, attemptId);
}

const retrySchema = z.object({ attemptId: z.string(), number: z.number().int(), answer: z.string().max(120) });

export async function recheckAnswer(input: z.infer<typeof retrySchema>): Promise<{ error?: string; view: ListeningView }> {
  const user = await requireStudent();
  const { attemptId, number, answer } = retrySchema.parse(input);
  const r = await retryListening(user.id, attemptId, number, answer);
  return { error: r.error, view: await view(user.id, attemptId) };
}

/** A fresh attempt after finishing, to practise the lesson again. */
export async function restartLesson(lessonId: string): Promise<ListeningView> {
  const user = await requireStudent();
  const lesson = await db.listeningLesson.findFirstOrThrow({ where: { id: lessonId, ...lessonVisibleTo(user.id) }, select: { total: true } });
  const a = await db.listeningAttempt.create({ data: { userId: user.id, lessonId } });
  return viewOf(a, lesson.total);
}

/** The student has read the lesson's key words; the questions unlock. */
export async function markVocabularySeen(attemptId: string): Promise<ListeningView> {
  const user = await requireStudent();
  await markVocabSeen(user.id, attemptId);
  return view(user.id, attemptId);
}

function slugify(title: string) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "lesson";
  return `${base}-${randomInt(36 ** 4).toString(36)}`;
}

/** Admin teachers upload a lesson JSON; it becomes a page in every student's Listening library. One file per call. */
export async function uploadLesson(raw: string): Promise<FormState> {
  const teacher = await requireAdmin();
  if (typeof raw !== "string" || !raw.trim()) return { error: "Choose a .json file or paste the JSON." };
  if (raw.length > 200_000) return { error: "That file is too large for one lesson." };
  const parsed = parseListeningJson(raw);
  if (!parsed.ok) return { error: "Not saved. Fix these points and upload again:", errors: parsed.errors };
  const { title, video, questionGroups, vocabulary } = parsed.data;
  const same = await db.listeningLesson.findFirst({ where: { title: { equals: title, mode: "insensitive" } }, select: { id: true } });
  if (same) return { error: `There is already a lesson called “${title}”. Delete it first if you want to replace it.` };
  const total = answerKey(questionGroups).length;
  const lesson = await db.listeningLesson.create({
    data: { slug: slugify(title), title, videoId: youtubeId(video)!, questions: questionGroups, vocabulary, wordCount: vocabulary.length, total, ownerId: teacher.id },
  });
  await ensureLessonDeck(lesson);
  return { ok: `“${title}” saved: ${total} questions, ${vocabulary.length} key words.` };
}

export async function deleteLesson(lessonId: string) {
  await requireAdmin();
  await db.listeningLesson.delete({ where: { id: lessonId } }).catch(() => undefined);
  refresh();
}
