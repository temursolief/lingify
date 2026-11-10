import { getSession, isAdmin } from "@/lib/auth";
import { readApkg } from "@/lib/apkg";
import { db } from "@/lib/db";
import { saveImportedDeck } from "@/lib/deck-import";

const MAX_BYTES = 200 * 1024 * 1024;

/** Admin teachers upload an Anki .apkg; its cards become a deck every student can study. */
export async function POST(request: Request) {
  const session = await getSession();
  const user = session ? await db.user.findUnique({ where: { id: session.userId } }) : null;
  if (!user || user.role !== "TEACHER" || !isAdmin(user.email)) return Response.json({ error: "Only admin teachers can upload decks." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return Response.json({ error: "Choose an .apkg file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is larger than 200 MB." }, { status: 400 });
  if (!/\.(apkg|colpkg)$/i.test(file.name)) return Response.json({ error: "Export the deck from Anki as an .apkg file." }, { status: 400 });

  let deck;
  try {
    deck = readApkg(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.(apkg|colpkg)$/i, ""));
  } catch (e) {
    return Response.json({ error: (e as Error).message || "This file could not be read as an Anki deck." }, { status: 400 });
  }

  await saveImportedDeck(deck);
  return Response.json({ ok: true, name: deck.name, cards: deck.cards.length, media: deck.media.length });
}
