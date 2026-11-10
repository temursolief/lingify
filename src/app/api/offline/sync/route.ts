import { z } from "zod";
import type { Rating } from "@/lib/anki";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyReviews } from "@/lib/decks";

const MAX_AGE_MS = 30 * 86_400_000;

const schema = z.object({
  reviews: z.array(z.object({ cardId: z.string(), rating: z.number().int().min(1).max(4), at: z.iso.datetime() })).max(2000),
});

/** A sane timestamp from the device: never in the future, never older than a month. */
function clamp(at: string) {
  return new Date(Math.max(Math.min(Date.parse(at), Date.now()), Date.now() - MAX_AGE_MS));
}

/**
 * Saves flashcard answers the browser has queued (while studying online, or offline earlier), in the order they
 * were given. Sending the same answers twice is safe.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") return new Response(null, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const reviews = parsed.data.reviews.map((r) => ({ cardId: r.cardId, rating: r.rating as Rating, at: clamp(r.at) }));
  try {
    return Response.json({ applied: await applyReviews(session.userId, reviews) });
  } catch (error) {
    // A cookie can outlive its account (e.g. after the demo data is reseeded).
    if (!(await db.user.findUnique({ where: { id: session.userId }, select: { id: true } }))) return new Response(null, { status: 401 });
    console.error("offline sync failed", error);
    return new Response(null, { status: 500 });
  }
}
