"use server";

import { randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { personalDeck } from "@/lib/decks";
import { retryListening, submitListening, viewOf, vocabularyOf, type ListeningView } from "@/lib/listening";
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
  const lesson = await db.listeningLesson.findUniqueOrThrow({ where: { id: lessonId }, select: { total: true } });
  const a = await db.listeningAttempt.create({ data: { userId: user.id, lessonId } });
  return viewOf(a, lesson.total);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Adds the lesson's key words to the student's own deck. With an example sentence, the front blanks the word out
 * in it; without one, the front is the word. Adding twice does nothing new.
 */
export async function addLessonVocabulary(lessonId: string): Promise<{ added: number }> {
  const user = await requireStudent();
  const lesson = await db.listeningLesson.findUniqueOrThrow({ where: { id: lessonId }, select: { id: true, vocabulary: true } });
  const deck = await personalDeck(user.id);
  const noteType = `lesson:${lesson.id}`;
  const existing = new Set((await db.card.findMany({ where: { deckId: deck.id, noteType }, select: { back: true } })).map((c) => c.back));
  let position = await db.card.count({ where: { deckId: deck.id } });
  const cards = vocabularyOf(lesson).flatMap((v) => {
    const pattern = new RegExp(`\\b${v.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*`, "i");
    const front = v.example && pattern.test(v.example)
      ? `<div class="sentence">${esc(v.example).replace(pattern, '<span class="cloze">[...]</span>')}</div>`
      : `<div class="chunk">${esc(v.word)}</div>`;
    const back = [
      v.example ? `<div class="sentence">${esc(v.example)}</div><hr>` : "",
      `<div class="chunk">${esc(v.word)}</div>`,
      `<div class="meaning">${esc(v.meaning)}</div>`,
      v.uz && user.uzbekGlosses ? `<div class="uz">O‘zbekcha: ${esc(v.uz)}</div>` : "",
    ].join("");
    if (existing.has(back)) return [];
    return [{ deckId: deck.id, front, back, noteType, position: position++ }];
  });
  if (cards.length) await db.card.createMany({ data: cards });
  return { added: cards.length };
}

function slugify(title: string) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "lesson";
  return `${base}-${randomInt(36 ** 4).toString(36)}`;
}

/** Admin teachers upload a lesson JSON; it becomes a page in every student's Listening library. */
export async function uploadLesson(_: FormState, formData: FormData): Promise<FormState> {
  const teacher = await requireAdmin();
  const file = formData.get("file");
  const raw = file instanceof File && file.size ? await file.text() : String(formData.get("json") ?? "");
  if (!raw.trim()) return { error: "Choose a .json file or paste the JSON." };
  if (raw.length > 200_000) return { error: "That file is too large for one lesson." };
  const parsed = parseListeningJson(raw);
  if (!parsed.ok) return { error: "The lesson was not saved. Fix these points and upload again:", errors: parsed.errors };
  const { title, video, questionGroups, vocabulary } = parsed.data;
  const total = answerKey(questionGroups).length;
  await db.listeningLesson.create({
    data: { slug: slugify(title), title, videoId: youtubeId(video)!, questions: questionGroups, vocabulary, total, ownerId: teacher.id },
  });
  refresh();
  return { ok: `“${title}” saved: ${total} questions, ${vocabulary.length} key words. It is now in every student's Listening library.` };
}

export async function deleteLesson(lessonId: string) {
  await requireAdmin();
  await db.listeningLesson.delete({ where: { id: lessonId } }).catch(() => undefined);
  refresh();
}
