import "server-only";
import type { CardQueue } from "@/generated/prisma/client";
import { answer, deckCounts, newSchedule, OPTIONS, pickNext, type Rating, type Schedule } from "./anki";
import { db } from "./db";

export const PERSONAL_DECK = "My IELTS chunks";

/** Shared decks uploaded by an admin, plus the student's own deck (created on first use). */
export async function studentDecks(userId: string) {
  const own = await db.deck.findFirst({ where: { ownerId: userId } });
  if (!own) await db.deck.create({ data: { name: PERSONAL_DECK, ownerId: userId } });
  return db.deck.findMany({ where: { OR: [{ ownerId: null }, { ownerId: userId }] }, orderBy: [{ ownerId: "asc" }, { createdAt: "asc" }] });
}

export async function personalDeck(userId: string) {
  return (await db.deck.findFirst({ where: { ownerId: userId } })) ?? db.deck.create({ data: { name: PERSONAL_DECK, ownerId: userId } });
}

export async function canUseDeck(userId: string, deckId: string) {
  return !!(await db.deck.findFirst({ where: { id: deckId, OR: [{ ownerId: null }, { ownerId: userId }] }, select: { id: true } }));
}

const toSchedule = (s: { queue: CardQueue; due: Date; interval: number; ease: number; reps: number; lapses: number; step: number }): Schedule => ({
  queue: s.queue,
  due: s.due,
  interval: s.interval,
  ease: s.ease,
  reps: s.reps,
  lapses: s.lapses,
  step: s.step,
});

/** How many new cards and reviews are still allowed today in a deck (Anki's daily limits). */
export async function limitsLeft(userId: string, deckId: string, now = new Date()) {
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  const logs = await db.reviewLog.groupBy({
    by: ["queue"],
    where: { userId, at: { gte: since }, card: { deckId } },
    _count: true,
  });
  // A new card is "introduced" by its first answer, logged with queue NEW.
  const introduced = logs.find((l) => l.queue === "NEW")?._count ?? 0;
  const reviewed = logs.find((l) => l.queue === "REVIEW")?._count ?? 0;
  return { newLeft: Math.max(0, OPTIONS.newPerDay - introduced), reviewsLeft: Math.max(0, OPTIONS.reviewsPerDay - reviewed) };
}

/** Deck list numbers: New, Learn, Due, like the AnkiWeb deck list. */
export async function deckSummary(userId: string, deckId: string, now = new Date()) {
  const [states, total, limits] = await Promise.all([
    db.cardState.findMany({ where: { userId, card: { deckId } }, select: { queue: true, due: true, interval: true, ease: true, reps: true, lapses: true, step: true } }),
    db.card.count({ where: { deckId } }),
    limitsLeft(userId, deckId, now),
  ]);
  const unseen = total - states.length;
  const schedules = [...states.map(toSchedule), ...Array.from({ length: Math.min(unseen, OPTIONS.newPerDay) }, () => newSchedule(now))];
  return { ...deckCounts(schedules, now, limits.newLeft, limits.reviewsLeft), total };
}

export type StudyCard = { id: string; front: string; back: string; noteType: string; schedule: Schedule };

/**
 * The next card to show, in Anki's order. Loads the due and soon-due cards with a state plus the next new cards
 * that have never been shown.
 */
export async function nextCard(userId: string, deckId: string, now = new Date()): Promise<StudyCard | null> {
  const limits = await limitsLeft(userId, deckId, now);
  const soon = new Date(now.getTime() + OPTIONS.learnAheadMinutes * 60_000);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const [states, fresh] = await Promise.all([
    db.cardState.findMany({
      where: {
        userId,
        card: { deckId },
        OR: [{ queue: { in: ["LEARNING", "RELEARNING"] }, due: { lte: soon } }, { queue: "REVIEW", due: { lte: endOfDay } }, { queue: "NEW" }],
      },
      include: { card: true },
      orderBy: { due: "asc" },
      take: 200,
    }),
    limits.newLeft > 0
      ? db.card.findMany({ where: { deckId, states: { none: { userId } } }, orderBy: { position: "asc" }, take: 1 })
      : Promise.resolve([]),
  ]);
  const candidates: StudyCard[] = [
    ...states.map((s) => ({ id: s.card.id, front: s.card.front, back: s.card.back, noteType: s.card.noteType, schedule: toSchedule(s) })),
    ...fresh.map((c, i) => ({ id: c.id, front: c.front, back: c.back, noteType: c.noteType, schedule: newSchedule(now, i + c.position) })),
  ];
  return pickNext(candidates, now, limits.newLeft, limits.reviewsLeft);
}

/** Saves one answer. `at` is when the student answered (for reviews done offline and synced later). */
export async function answerCard(userId: string, cardId: string, rating: Rating, at = new Date()) {
  const card = await db.card.findUnique({ where: { id: cardId }, select: { deckId: true } });
  if (!card || !(await canUseDeck(userId, card.deckId))) throw new Error("Card not found");
  const existing = await db.cardState.findUnique({ where: { userId_cardId: { userId, cardId } } });
  const before = existing ? toSchedule(existing) : newSchedule(at);
  const next = answer(before, rating, at);
  const data = { queue: next.queue, due: next.due, interval: next.interval, ease: next.ease, reps: next.reps, lapses: next.lapses, step: next.step };
  await db.$transaction([
    db.cardState.upsert({ where: { userId_cardId: { userId, cardId } }, create: { userId, cardId, ...data }, update: data }),
    db.reviewLog.create({ data: { userId, cardId, rating, queue: before.queue, interval: next.interval, at } }),
    db.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }),
  ]);
  return next;
}

/** Flashcards due today across all of a student's decks, for the sidebar badge. */
export async function dueToday(userId: string, now = new Date()) {
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return db.cardState.count({ where: { userId, queue: { not: "NEW" }, due: { lte: endOfDay } } });
}
