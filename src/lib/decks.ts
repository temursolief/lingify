import "server-only";
import { Prisma, type CardQueue } from "@/generated/prisma/client";
import { answer, newSchedule, OPTIONS, type Rating, type Schedule } from "./anki";
import { db } from "./db";
import { store, type OfflineCard } from "./offline-types";
import type { StudyQueue } from "./study";
import { endOfDay, startOfDay } from "./time";

export const PERSONAL_DECK = "My IELTS chunks";

/** The student's own deck, created on first use. One per student (unique owner), so two requests cannot make two. */
export function personalDeck(userId: string) {
  return db.deck.upsert({ where: { ownerId: userId }, create: { name: PERSONAL_DECK, ownerId: userId }, update: {} });
}

const deckFields = { id: true, name: true, css: true, ownerId: true } as const;

/** Shared decks uploaded by an admin, plus the student's own deck. */
export async function studentDecks(userId: string) {
  const where = { OR: [{ ownerId: null }, { ownerId: userId }] };
  const orderBy = [{ ownerId: "asc" as const }, { createdAt: "asc" as const }];
  const decks = await db.deck.findMany({ where, orderBy, select: deckFields });
  if (decks.some((d) => d.ownerId === userId)) return decks;
  await personalDeck(userId);
  return db.deck.findMany({ where, orderBy, select: deckFields });
}

/** The deck, if this student may study it: a shared deck or their own. */
export function usableDeck(userId: string, deckId: string) {
  return db.deck.findFirst({ where: { id: deckId, OR: [{ ownerId: null }, { ownerId: userId }] }, select: deckFields });
}

const scheduleFields = { queue: true, due: true, interval: true, ease: true, reps: true, lapses: true, step: true } as const;

const toSchedule = (s: { queue: CardQueue; due: Date; interval: number; ease: number; reps: number; lapses: number; step: number }): Schedule => ({
  queue: s.queue,
  due: s.due,
  interval: s.interval,
  ease: s.ease,
  reps: s.reps,
  lapses: s.lapses,
  step: s.step,
});

type Limits = { newLeft: number; reviewsLeft: number };

const limitsFrom = (introduced: number, reviewed: number): Limits => ({
  newLeft: Math.max(0, OPTIONS.newPerDay - introduced),
  reviewsLeft: Math.max(0, OPTIONS.reviewsPerDay - reviewed),
});

/** How many new cards and reviews are still allowed today in a deck (Anki's daily limits). */
export async function limitsLeft(userId: string, deckId: string, now = new Date()): Promise<Limits> {
  const logs = await db.reviewLog.groupBy({
    by: ["queue"],
    where: { userId, at: { gte: startOfDay(now) }, queue: { in: ["NEW", "REVIEW"] }, card: { deckId } },
    _count: true,
  });
  // A new card is "introduced" by its first answer, logged with queue NEW.
  return limitsFrom(logs.find((l) => l.queue === "NEW")?._count ?? 0, logs.find((l) => l.queue === "REVIEW")?._count ?? 0);
}

export type DeckCounts = { new: number; learn: number; due: number; total: number };

/**
 * Deck list numbers (New, Learn, Due, like the AnkiWeb deck list) for several decks at once. The database counts:
 * no card or schedule rows are loaded, whatever the size of the decks.
 */
export async function deckSummaries(userId: string, deckIds: string[], now = new Date()): Promise<Map<string, DeckCounts>> {
  const result = new Map<string, DeckCounts>();
  if (!deckIds.length) return result;
  const soon = new Date(now.getTime() + OPTIONS.learnAheadMinutes * 60_000);
  const [cards, logs] = await Promise.all([
    db.$queryRaw<{ deckId: string; total: number; seen: number; fresh: number; learn: number; due: number }[]>`
      SELECT c."deckId" AS "deckId",
             count(*)::int AS total,
             count(s."cardId")::int AS seen,
             (count(*) FILTER (WHERE s."queue" = 'NEW'))::int AS fresh,
             (count(*) FILTER (WHERE s."queue" IN ('LEARNING', 'RELEARNING') AND s."due" <= ${soon}))::int AS learn,
             (count(*) FILTER (WHERE s."queue" = 'REVIEW' AND s."due" <= ${endOfDay(now)}))::int AS due
      FROM "Card" c
      LEFT JOIN "CardState" s ON s."cardId" = c."id" AND s."userId" = ${userId}
      WHERE c."deckId" IN (${Prisma.join(deckIds)})
      GROUP BY c."deckId"`,
    db.$queryRaw<{ deckId: string; queue: CardQueue; n: number }[]>`
      SELECT c."deckId" AS "deckId", l."queue" AS queue, count(*)::int AS n
      FROM "ReviewLog" l
      JOIN "Card" c ON c."id" = l."cardId"
      WHERE l."userId" = ${userId} AND l."at" >= ${startOfDay(now)} AND l."queue" IN ('NEW', 'REVIEW') AND c."deckId" IN (${Prisma.join(deckIds)})
      GROUP BY c."deckId", l."queue"`,
  ]);
  for (const id of deckIds) {
    const row = cards.find((c) => c.deckId === id);
    const done = (queue: CardQueue) => logs.find((l) => l.deckId === id && l.queue === queue)?.n ?? 0;
    const limits = limitsFrom(done("NEW"), done("REVIEW"));
    result.set(id, {
      new: row ? Math.min(limits.newLeft, row.total - row.seen + row.fresh) : 0,
      learn: row?.learn ?? 0,
      due: row ? Math.min(limits.reviewsLeft, row.due) : 0,
      total: row?.total ?? 0,
    });
  }
  return result;
}

/** New cards are ordered by a fixed date, so an unchanged queue serialises the same (the offline copy's ETag). */
const NEW_CARD_EPOCH = new Date(0);
/** Reviews sent to the browser in one go. A session with more due asks again when these are done. */
const REVIEW_BATCH = 100;

const cardFields = { id: true, front: true, back: true, noteType: true } as const;

/**
 * Everything the browser needs to run a study session by itself, with Anki's order and limits: the learning cards,
 * the reviews due by `reviewsUntil` (today, by default) and today's new cards. The browser schedules each answer
 * with the same code as the server, so the next card shows without waiting for the network.
 */
export async function studyQueue(
  userId: string,
  deckId: string,
  now = new Date(),
  { reviewsUntil = endOfDay(now), batch = REVIEW_BATCH }: { reviewsUntil?: Date; batch?: number } = {},
): Promise<StudyQueue> {
  const inDeck = { userId, card: { deckId } };
  const dueReviews = { ...inDeck, queue: "REVIEW" as const, due: { lte: reviewsUntil } };
  const [limits, learning, reviews, reviewCount, fresh] = await Promise.all([
    limitsLeft(userId, deckId, now),
    db.cardState.findMany({
      where: { ...inDeck, queue: { in: ["LEARNING", "RELEARNING", "NEW"] } },
      select: { ...scheduleFields, card: { select: cardFields } },
      orderBy: { due: "asc" },
      take: 200,
    }),
    db.cardState.findMany({ where: dueReviews, select: { ...scheduleFields, card: { select: cardFields } }, orderBy: { due: "asc" }, take: batch }),
    db.cardState.count({ where: dueReviews }),
    db.card.findMany({ where: { deckId, states: { none: { userId } } }, select: cardFields, orderBy: { position: "asc" }, take: OPTIONS.newPerDay }),
  ]);
  const shown = reviews.slice(0, limits.reviewsLeft);
  const cards: OfflineCard[] = [
    ...[...learning, ...shown].map((s) => ({ ...s.card, schedule: store(toSchedule(s)) })),
    ...fresh.slice(0, limits.newLeft).map((c, i) => ({ ...c, schedule: store(newSchedule(NEW_CARD_EPOCH, i)) })),
  ];
  return { cards, ...limits, moreDue: Math.max(0, Math.min(limits.reviewsLeft, reviewCount) - shown.length), dueBy: reviewsUntil.toISOString() };
}

export type Review = { cardId: string; rating: Rating; at: Date };

/**
 * Saves a batch of answers in the order they were given: the ones a browser queued while studying, online or not.
 * `at` is when the student answered. An answer already saved (the browser sends again when a reply was lost) is
 * skipped, and so is one for a card the student may not use or that was deleted since.
 */
export async function applyReviews(userId: string, reviews: Review[]): Promise<number> {
  if (!reviews.length) return 0;
  const ids = [...new Set(reviews.map((r) => r.cardId))];
  const oldest = new Date(Math.min(...reviews.map((r) => r.at.getTime())));
  const [cards, states, logs] = await Promise.all([
    db.card.findMany({ where: { id: { in: ids }, deck: { OR: [{ ownerId: null }, { ownerId: userId }] } }, select: { id: true } }),
    db.cardState.findMany({ where: { userId, cardId: { in: ids } }, select: { cardId: true, ...scheduleFields } }),
    db.reviewLog.findMany({ where: { userId, cardId: { in: ids }, at: { gte: oldest } }, select: { cardId: true, at: true } }),
  ]);
  const allowed = new Set(cards.map((c) => c.id));
  const keyOf = (cardId: string, at: Date) => `${cardId}|${at.getTime()}`;
  const saved = new Set(logs.map((l) => keyOf(l.cardId, l.at)));
  const schedules = new Map(states.map((s) => [s.cardId, toSchedule(s)]));
  const changed = new Set<string>();
  const newLogs: Prisma.ReviewLogCreateManyInput[] = [];

  for (const r of [...reviews].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (!allowed.has(r.cardId) || saved.has(keyOf(r.cardId, r.at))) continue;
    saved.add(keyOf(r.cardId, r.at));
    const before = schedules.get(r.cardId) ?? newSchedule(r.at);
    const next = answer(before, r.rating, r.at);
    schedules.set(r.cardId, next);
    changed.add(r.cardId);
    newLogs.push({ userId, cardId: r.cardId, rating: r.rating, queue: before.queue, interval: next.interval, at: r.at });
  }
  if (!newLogs.length) return 0;

  await db.$transaction([
    ...[...changed].map((cardId) => {
      const s = schedules.get(cardId)!;
      const data = { queue: s.queue, due: s.due, interval: s.interval, ease: s.ease, reps: s.reps, lapses: s.lapses, step: s.step };
      return db.cardState.upsert({ where: { userId_cardId: { userId, cardId } }, create: { userId, cardId, ...data }, update: data });
    }),
    db.reviewLog.createMany({ data: newLogs }),
    db.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }),
  ]);
  return newLogs.length;
}

/** Flashcards due today across all of a student's decks, for the sidebar badge. */
export async function dueToday(userId: string, now = new Date()) {
  return db.cardState.count({ where: { userId, queue: { not: "NEW" }, due: { lte: endOfDay(now) } } });
}
