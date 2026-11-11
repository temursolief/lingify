import { currentUser, getSession, isAdmin } from "@/lib/auth";
import { readApkg } from "@/lib/apkg";
import { db } from "@/lib/db";
import { saveImportedDeck } from "@/lib/deck-import";

const MAX_BYTES = 200 * 1024 * 1024;

/**
 * A teacher uploads an Anki .apkg for one of their own passages: its cards become that passage's shared deck,
 * visible to whoever the passage is assigned to. Without a passage, only an admin teacher may upload one, as a
 * deck shared with every student (the old, passage-less decks).
 */
export async function POST(request: Request) {
  const session = await getSession();
  const user = session ? await currentUser(session.userId) : null;
  if (!user || user.role !== "TEACHER") return Response.json({ error: "Only teachers can upload decks." }, { status: 403 });

  const form = await request.formData();
  const passageId = form.get("passageId");
  let passage: { id: string; title: string } | undefined;
  if (typeof passageId === "string" && passageId) {
    const found = await db.passage.findFirst({ where: { id: passageId, ownerId: user.id }, select: { id: true, title: true } });
    if (!found) return Response.json({ error: "Choose one of your own passages." }, { status: 400 });
    passage = found;
  } else if (!isAdmin(user.email)) {
    return Response.json({ error: "Only admin teachers can upload a deck for everyone." }, { status: 403 });
  }

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

  try {
    await saveImportedDeck(deck, passage);
  } catch (e) {
    console.error("Deck import failed", e);
    return Response.json({ error: (e as Error).message || "The deck could not be saved. Nothing was added; try again." }, { status: 500 });
  }
  return Response.json({ ok: true, name: passage?.title ?? deck.name, cards: deck.cards.length, media: deck.media.length });
}
