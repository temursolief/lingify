import { z } from "zod";
import type { Rating } from "@/lib/anki";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { answerCard } from "@/lib/decks";

const MAX_AGE_MS = 30 * 86_400_000;

const schema = z.object({
  reviews: z.array(z.object({ cardId: z.string(), rating: z.number().int().min(1).max(4), at: z.iso.datetime() })).max(2000),
});

/** A sane timestamp from the laptop: never in the future, never older than a month. */
function clamp(at: string) {
  return new Date(Math.max(Math.min(Date.parse(at), Date.now()), Date.now() - MAX_AGE_MS));
}

/** Applies flashcard answers given offline, in the order they were given. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") return new Response(null, { status: 401 });
  // A cookie can outlive its account (e.g. after the demo data is reseeded).
  if (!(await db.user.findUnique({ where: { id: session.userId }, select: { id: true } }))) return new Response(null, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  let applied = 0;
  for (const r of [...parsed.data.reviews].sort((a, b) => a.at.localeCompare(b.at))) {
    try {
      await answerCard(session.userId, r.cardId, r.rating as Rating, clamp(r.at));
      applied++;
    } catch {
      // A card deleted since (an undone highlight, a removed deck) is skipped.
    }
  }
  return Response.json({ applied });
}
