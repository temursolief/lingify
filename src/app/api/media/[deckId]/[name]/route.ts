import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/** Images and sounds from an imported Anki deck. Cached hard by the browser and the service worker: they never change. */
export async function GET(_request: Request, ctx: RouteContext<"/api/media/[deckId]/[name]">) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  const { deckId, name } = await ctx.params;
  let file = name;
  try {
    file = decodeURIComponent(name);
  } catch {
    // a "%" that is not an escape: the name is used as it came
  }
  const media = await db.deckMedia.findUnique({ where: { deckId_name: { deckId, name: file } }, select: { mime: true, data: true } });
  if (!media) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(media.data), {
    headers: { "Content-Type": media.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
