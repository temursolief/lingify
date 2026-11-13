"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { chunkMeaning, knownChunkMeaning } from "@/lib/chunk-meaning";
import { markXpDirty } from "@/lib/xp-store";
import { db } from "@/lib/db";
import { passageDeck, studyQueue, usableDeck } from "@/lib/decks";
import { passageVisibleTo } from "@/lib/passages";
import type { StudyQueue } from "@/lib/study";

/**
 * More cards for a study session that has run out: the browser has sent its answers, so this is the queue as the
 * server now sees it. No cards means the deck is done for now.
 */
export async function loadStudyQueue(deckId: string): Promise<StudyQueue | null> {
  const user = await requireStudent();
  if (typeof deckId !== "string" || !(await usableDeck(user.id, deckId))) return null;
  return studyQueue(user.id, deckId);
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The sentence around a highlight, found in the stored paragraph so the card never trusts text sent by the browser. */
function sentenceAround(paragraph: string, start: number, end: number) {
  let from = start;
  while (from > 0 && !/[.!?]/.test(paragraph[from - 1])) from--;
  let to = end;
  while (to < paragraph.length && !/[.!?]/.test(paragraph[to])) to++;
  if (to < paragraph.length) to++;
  return { sentence: paragraph.slice(from, to).trim(), offset: paragraph.slice(from, to).search(/\S/) + from };
}

const chunkSchema = z.object({ passageId: z.string(), paragraph: z.number().int().min(0), start: z.number().int().min(0), end: z.number().int().min(1) });
type ChunkInput = z.infer<typeof chunkSchema>;

/** `pending`: the meaning is still being written; ask for it with explainChunkCard. */
export type ChunkCard = { id: string; chunk: string; meaning: string; uz: string | null; front: string; pending: boolean } | { error: string };

type ChunkContext = { passageId: string; title: string; chunk: string; sentence: string; before: string; after: string };

/** The highlighted chunk and its sentence, read from the stored passage so a card never trusts text sent by the browser. */
async function chunkContext(userId: string, input: ChunkInput): Promise<ChunkContext | { error: string }> {
  const { passageId, paragraph, start, end } = chunkSchema.parse(input);
  const passage = await db.passage.findFirst({ where: { id: passageId, ...passageVisibleTo(userId) }, select: { title: true, paragraphs: true } });
  const text = passage?.paragraphs[paragraph];
  if (!text || end > text.length || end <= start) return { error: "Select a few words in the passage first." };
  const chunk = text.slice(start, end).trim();
  if (chunk.split(/\s+/).length > 8) return { error: "Select a shorter chunk: up to 8 words." };
  const { sentence, offset } = sentenceAround(text, start, end);
  const chunkStart = text.indexOf(chunk, start) - offset;
  return { passageId, title: passage!.title, chunk, sentence, before: sentence.slice(0, chunkStart), after: sentence.slice(chunkStart + chunk.length) };
}

function cardBack({ chunk, before, after }: ChunkContext, meaning: string, uz: string | null) {
  return [
    `<div class="sentence">${escapeHtml(before)}<span class="cloze">${escapeHtml(chunk)}</span>${escapeHtml(after)}</div>`,
    `<hr><div class="chunk">${escapeHtml(chunk)}</div>`,
    meaning ? `<div class="meaning">${escapeHtml(meaning)}</div>` : "",
    uz ? `<div class="uz">O‘zbekcha: ${escapeHtml(uz)}</div>` : "",
  ].join("");
}

/** Writes the meaning onto the card, unless the student has removed it meanwhile. */
async function fillMeaning(userId: string, cardId: string, ctx: ChunkContext, showUz: boolean) {
  const { meaning, uz } = await chunkMeaning(ctx.chunk, ctx.sentence);
  const shownUz = showUz ? uz : null;
  await db.card.updateMany({ where: { id: cardId, ownerId: userId }, data: { back: cardBack(ctx, meaning, shownUz) } });
  return { meaning, uz: shownUz };
}

/**
 * Highlight → flashcard in one click, saved at once, into that passage's shared deck (created on first use) with
 * this student as its owner, so only they see it. Front: the whole sentence from the passage with the chunk blanked
 * out. Back: the chunk in its sentence, a short meaning and, if the student wants it, Uzbek. A meaning not known yet is
 * looked up in the background (the free dictionary), so the student never waits for it.
 */
export async function addChunkCard(input: ChunkInput): Promise<ChunkCard> {
  const user = await requireStudent();
  const ctx = await chunkContext(user.id, input);
  if ("error" in ctx) return ctx;

  const known = await knownChunkMeaning(ctx.chunk, ctx.sentence);
  const uz = known && user.uzbekGlosses ? known.uz : null;
  const front = `<div class="sentence">${escapeHtml(ctx.before)}<span class="cloze">[...]</span>${escapeHtml(ctx.after)}</div>`;
  const deck = await passageDeck(ctx.passageId, ctx.title);
  const position = await db.card.count({ where: { deckId: deck.id } });
  const card = await db.card.create({ data: { deckId: deck.id, ownerId: user.id, front, back: cardBack(ctx, known?.meaning ?? "", uz), noteType: "chunk", position } });
  // Runs after the reply: the card gets its meaning even if the student closes the page straight away.
  if (!known) after(() => fillMeaning(user.id, card.id, ctx, user.uzbekGlosses).catch((e) => console.error("Chunk meaning failed", e)));
  return { id: card.id, chunk: ctx.chunk, meaning: known?.meaning ?? "", uz, front: `${ctx.before}[...]${ctx.after}`, pending: !known };
}

/** The meaning of a card just made, once it is written; shares the request already made in the background. */
export async function explainChunkCard(cardId: string, input: ChunkInput): Promise<{ meaning: string; uz: string | null } | null> {
  const user = await requireStudent();
  if (typeof cardId !== "string") return null;
  const ctx = await chunkContext(user.id, input);
  if ("error" in ctx) return null;
  return fillMeaning(user.id, cardId, ctx, user.uzbekGlosses);
}

/** Undo for a card the student just made from a highlight. */
export async function deleteOwnCard(cardId: string) {
  const user = await requireStudent();
  // Its reviews go with it (cascade), and so does their XP.
  const firstReview = await db.reviewLog.aggregate({ where: { cardId, userId: user.id, card: { ownerId: user.id } }, _min: { at: true } });
  await db.card.deleteMany({ where: { id: cardId, ownerId: user.id } });
  if (firstReview._min.at) await markXpDirty(user.id, firstReview._min.at);
  refresh();
}
