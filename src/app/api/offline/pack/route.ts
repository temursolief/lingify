import { createHash } from "node:crypto";
import { newSchedule, OPTIONS } from "@/lib/anki";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { limitsLeft, studentDecks } from "@/lib/decks";
import { store, type OfflineDeck, type OfflinePack, type OfflinePassage } from "@/lib/offline-types";
import { passageVisibleTo } from "@/lib/passages";

const OFFLINE_PASSAGES = 6;
const DAY_MS = 86_400_000;
const MAX_REVIEW_CARDS = 300;
/** New cards are ordered by a fixed date, so an unchanged pack hashes the same and the download is skipped. */
const NEW_CARD_EPOCH = new Date(0);

/**
 * Everything the offline app needs in one download: per deck, the cards due within a day and today's new cards
 * with their schedules; and the passages to read. An ETag skips the download when nothing has changed.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") return new Response(null, { status: 401 });
  // A cookie can outlive its account (e.g. after the demo data is reseeded).
  if (!(await db.user.findUnique({ where: { id: session.userId }, select: { id: true } }))) return new Response(null, { status: 401 });
  const userId = session.userId;
  const now = new Date();
  const until = new Date(now.getTime() + DAY_MS);

  const decks: OfflineDeck[] = [];
  for (const deck of await studentDecks(userId)) {
    const limits = await limitsLeft(userId, deck.id, now);
    const [states, fresh] = await Promise.all([
      db.cardState.findMany({
        where: { userId, card: { deckId: deck.id }, OR: [{ queue: { not: "NEW" }, due: { lte: until } }, { queue: "NEW" }] },
        include: { card: true },
        orderBy: { due: "asc" },
        take: MAX_REVIEW_CARDS,
      }),
      db.card.findMany({ where: { deckId: deck.id, states: { none: { userId } } }, orderBy: { position: "asc" }, take: Math.min(limits.newLeft, OPTIONS.newPerDay) }),
    ]);
    decks.push({
      id: deck.id,
      name: deck.name,
      css: deck.css as Record<string, string>,
      newLeft: limits.newLeft,
      reviewsLeft: limits.reviewsLeft,
      cards: [
        ...states.map((s) => ({
          id: s.card.id,
          front: s.card.front,
          back: s.card.back,
          noteType: s.card.noteType,
          schedule: store({ queue: s.queue, due: s.due, interval: s.interval, ease: s.ease, reps: s.reps, lapses: s.lapses, step: s.step }),
        })),
        ...fresh.map((c, i) => ({ id: c.id, front: c.front, back: c.back, noteType: c.noteType, schedule: store(newSchedule(NEW_CARD_EPOCH, i)) })),
      ],
    });
  }

  const [assigned, builtIn] = await Promise.all([
    db.passage.findMany({
      where: { assignments: { some: { recipients: { some: { studentId: userId, completedAt: null } } } } },
      select: { id: true, slug: true, title: true, paragraphs: true },
    }),
    db.passage.findMany({ where: { ownerId: null, ...passageVisibleTo(userId) }, select: { id: true, slug: true, title: true, paragraphs: true }, orderBy: { title: "asc" } }),
  ]);
  const passages: OfflinePassage[] = [
    ...assigned.map((p) => ({ ...p, assigned: true })),
    ...builtIn.filter((p) => !assigned.some((a) => a.id === p.id)).map((p) => ({ ...p, assigned: false })),
  ].slice(0, OFFLINE_PASSAGES);

  const body: Omit<OfflinePack, "packedAt"> = { userId, name: session.name, decks, passages };
  const json = JSON.stringify(body);
  const etag = `"${createHash("sha1").update(json).digest("base64url")}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return new Response(JSON.stringify({ ...body, packedAt: now.toISOString() }), {
    headers: { "Content-Type": "application/json", ETag: etag, "Cache-Control": "private, no-cache" },
  });
}
