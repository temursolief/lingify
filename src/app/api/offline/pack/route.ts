import { createHash } from "node:crypto";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { studentDecks, studyQueue } from "@/lib/decks";
import type { OfflineDeck, OfflinePack, OfflinePassage } from "@/lib/offline-types";

const OFFLINE_PASSAGES = 6;
const DAY_MS = 86_400_000;
const MAX_REVIEW_CARDS = 300;

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

  const decks: OfflineDeck[] = await Promise.all(
    (await studentDecks(userId)).map(async (deck) => {
      // moreDue is left out: everything due within the day is already in the copy.
      const { cards, newLeft, reviewsLeft } = await studyQueue(userId, deck.id, now, { reviewsUntil: until, batch: MAX_REVIEW_CARDS });
      return { id: deck.id, name: deck.name, css: deck.css as Record<string, string>, cards, newLeft, reviewsLeft };
    }),
  );

  // Unfinished assignments first; finished ones fill what is left. Only the rows that go into the copy are read.
  const fields = { id: true, slug: true, title: true, paragraphs: true } as const;
  const due = await db.passage.findMany({
    where: { assignments: { some: { recipients: { some: { studentId: userId, completedAt: null } } } } },
    select: fields,
    orderBy: { title: "asc" },
    take: OFFLINE_PASSAGES,
  });
  const done = due.length < OFFLINE_PASSAGES
    ? await db.passage.findMany({
        where: { assignments: { some: { recipients: { some: { studentId: userId } } } }, id: { notIn: due.map((p) => p.id) } },
        select: fields,
        orderBy: { title: "asc" },
        take: OFFLINE_PASSAGES - due.length,
      })
    : [];
  const passages: OfflinePassage[] = [...due, ...done];

  const body: Omit<OfflinePack, "packedAt"> = { userId, name: session.name, decks, passages };
  const json = JSON.stringify(body);
  const etag = `"${createHash("sha1").update(json).digest("base64url")}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  // packedAt is not part of the ETag, so it is added to the text already built.
  return new Response(`${json.slice(0, -1)},"packedAt":${JSON.stringify(now.toISOString())}}`, {
    headers: { "Content-Type": "application/json", ETag: etag, "Cache-Control": "private, no-cache" },
  });
}
