"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { Rating } from "@/lib/anki";
import { requireStudent } from "@/lib/auth";
import { chunkMeaning } from "@/lib/chunk-meaning";
import { db } from "@/lib/db";
import { answerCard, canUseDeck, deckSummary, nextCard, personalDeck, type StudyCard } from "@/lib/decks";
import { passageVisibleTo } from "@/lib/passages";

const answerSchema = z.object({ deckId: z.string(), cardId: z.string(), rating: z.number().int().min(1).max(4) });

/** Saves the answer and returns the next card to show (or null when the deck is done for now). */
export type StudyStep = { card: StudyCard | null; counts: { new: number; learn: number; due: number } };

export async function answerAndNext(input: z.infer<typeof answerSchema>): Promise<StudyStep> {
  const user = await requireStudent();
  const { deckId, cardId, rating } = answerSchema.parse(input);
  if (!(await canUseDeck(user.id, deckId))) throw new Error("Deck not found");
  await answerCard(user.id, cardId, rating as Rating);
  const [card, counts] = await Promise.all([nextCard(user.id, deckId), deckSummary(user.id, deckId)]);
  return { card, counts };
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

export type ChunkCard = { id: string; chunk: string; meaning: string; uz: string | null; front: string } | { error: string };

/**
 * Highlight → flashcard in one click. Front: the whole sentence from the passage with the chunk blanked out.
 * Back: the chunk in its sentence, a short meaning (AI or dictionary) and, if the student wants it, Uzbek.
 */
export async function addChunkCard(input: z.infer<typeof chunkSchema>): Promise<ChunkCard> {
  const user = await requireStudent();
  const { passageId, paragraph, start, end } = chunkSchema.parse(input);
  const passage = await db.passage.findFirst({ where: { id: passageId, ...passageVisibleTo(user.id) }, select: { paragraphs: true } });
  const text = passage?.paragraphs[paragraph];
  if (!text || end > text.length || end <= start) return { error: "Select a few words in the passage first." };
  const chunk = text.slice(start, end).trim();
  if (chunk.split(/\s+/).length > 8) return { error: "Select a shorter chunk: up to 8 words." };

  const { sentence, offset } = sentenceAround(text, start, end);
  const chunkStart = text.indexOf(chunk, start) - offset;
  const before = sentence.slice(0, chunkStart);
  const after = sentence.slice(chunkStart + chunk.length);
  const { meaning, uz } = await chunkMeaning(chunk, sentence);

  const front = `<div class="sentence">${escapeHtml(before)}<span class="cloze">[...]</span>${escapeHtml(after)}</div>`;
  const back = [
    `<div class="sentence">${escapeHtml(before)}<span class="cloze">${escapeHtml(chunk)}</span>${escapeHtml(after)}</div>`,
    `<hr><div class="chunk">${escapeHtml(chunk)}</div>`,
    meaning ? `<div class="meaning">${escapeHtml(meaning)}</div>` : "",
    uz && user.uzbekGlosses ? `<div class="uz">O‘zbekcha: ${escapeHtml(uz)}</div>` : "",
  ].join("");

  const deck = await personalDeck(user.id);
  const position = await db.card.count({ where: { deckId: deck.id } });
  const card = await db.card.create({ data: { deckId: deck.id, front, back, noteType: "chunk", position } });
  return { id: card.id, chunk, meaning, uz: user.uzbekGlosses ? uz : null, front: `${before}[...]${after}` };
}

/** Undo for a card the student just made from a highlight. */
export async function deleteOwnCard(cardId: string) {
  const user = await requireStudent();
  await db.card.deleteMany({ where: { id: cardId, deck: { ownerId: user.id } } });
  refresh();
}
