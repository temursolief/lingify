import "server-only";
import { linkMedia } from "./anki-template";
import type { ImportedDeck } from "./apkg";
import { db } from "./db";

const BATCH = 500;

/** Stores an imported Anki deck as a shared deck (every student sees it), with media links pointing at Lingify. */
export async function saveImportedDeck(deck: ImportedDeck) {
  const created = await db.deck.create({ data: { name: deck.name, css: deck.css } });
  try {
    await fill(created.id, deck);
  } catch (e) {
    // No half-saved deck: its cards and media go with it.
    await db.deck.delete({ where: { id: created.id } }).catch(() => {});
    throw e;
  }
  return created;
}

async function fill(deckId: string, deck: ImportedDeck) {
  for (let i = 0; i < deck.cards.length; i += BATCH) {
    await db.card.createMany({
      data: deck.cards.slice(i, i + BATCH).map((c) => ({
        deckId,
        front: linkMedia(c.front, deckId),
        back: linkMedia(c.back, deckId),
        noteType: c.noteType,
        position: c.position,
      })),
    });
  }
  for (const m of deck.media) {
    await db.deckMedia.create({ data: { deckId, name: m.name, mime: m.mime, data: new Uint8Array(m.data) } });
  }
}
