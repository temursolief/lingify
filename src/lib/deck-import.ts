import "server-only";
import { linkMedia } from "./anki-template";
import type { ImportedDeck } from "./apkg";
import { db } from "./db";

const BATCH = 500;

/** Stores an imported Anki deck as a shared deck (every student sees it), with media links pointing at Lingify. */
export async function saveImportedDeck(deck: ImportedDeck) {
  const created = await db.deck.create({ data: { name: deck.name, css: deck.css } });
  for (let i = 0; i < deck.cards.length; i += BATCH) {
    await db.card.createMany({
      data: deck.cards.slice(i, i + BATCH).map((c) => ({
        deckId: created.id,
        front: linkMedia(c.front, created.id),
        back: linkMedia(c.back, created.id),
        noteType: c.noteType,
        position: c.position,
      })),
    });
  }
  for (const m of deck.media) {
    await db.deckMedia.create({ data: { deckId: created.id, name: m.name, mime: m.mime, data: new Uint8Array(m.data) } });
  }
  return created;
}
