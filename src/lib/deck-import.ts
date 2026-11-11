import "server-only";
import { linkMedia } from "./anki-template";
import type { ImportedDeck } from "./apkg";
import { db } from "./db";

const BATCH = 500;
/** A generous cap per deck, well inside Neon's free storage: beyond this, the teacher trims the deck's media. */
const MAX_DECK_MEDIA_BYTES = 20 * 1024 * 1024;

/**
 * Stores an imported Anki deck. Linked to a passage, its cards and media are merged into that passage's one deck
 * (by Anki note ID, so re-uploading the same export updates cards in place instead of losing students' progress
 * on them); otherwise a fresh deck is created, shared with every student as before.
 */
export async function saveImportedDeck(deck: ImportedDeck, passage?: { id: string; title: string }) {
  if (passage) {
    const found = await db.deck.upsert({ where: { passageId: passage.id }, create: { name: passage.title, passageId: passage.id, css: deck.css }, update: { css: deck.css } });
    await mergeCards(found.id, deck);
    await addMedia(found.id, deck.media);
    return found;
  }
  const created = await db.deck.create({ data: { name: deck.name, css: deck.css } });
  try {
    await mergeCards(created.id, deck);
    await addMedia(created.id, deck.media);
  } catch (e) {
    // No half-saved deck: its cards and media go with it.
    await db.deck.delete({ where: { id: created.id } }).catch(() => {});
    throw e;
  }
  return created;
}

/** New cards are added; a card whose Anki note ID matches one already in the deck is updated in place instead. */
async function mergeCards(deckId: string, deck: ImportedDeck) {
  const existing = await db.card.findMany({ where: { deckId, ownerId: null }, select: { id: true, ankiNoteId: true } });
  const byNote = new Map(existing.filter((c) => c.ankiNoteId).map((c) => [c.ankiNoteId!, c.id]));
  let position = existing.length;
  for (let i = 0; i < deck.cards.length; i += BATCH) {
    const batch = deck.cards.slice(i, i + BATCH);
    await db.$transaction(
      batch.map((c) => {
        const data = { front: linkMedia(c.front, deckId), back: linkMedia(c.back, deckId), noteType: c.noteType, ankiNoteId: c.ankiNoteId };
        const matchId = byNote.get(c.ankiNoteId);
        return matchId
          ? db.card.update({ where: { id: matchId }, data })
          : db.card.create({ data: { deckId, position: position++, ...data } });
      }),
    );
  }
}

/** Media already stored under the same name is left alone (re-uploading the same export should not grow the deck). */
async function addMedia(deckId: string, media: ImportedDeck["media"]) {
  if (!media.length) return;
  const existingNames = new Set((await db.deckMedia.findMany({ where: { deckId }, select: { name: true } })).map((m) => m.name));
  const [{ bytes }] = await db.$queryRaw<{ bytes: bigint }[]>`SELECT coalesce(sum(octet_length(data)), 0) AS bytes FROM "DeckMedia" WHERE "deckId" = ${deckId}`;
  let total = Number(bytes);
  for (const m of media) {
    if (existingNames.has(m.name)) continue;
    if (total + m.data.length > MAX_DECK_MEDIA_BYTES) {
      throw new Error(`This deck's images and sounds would pass ${Math.round(MAX_DECK_MEDIA_BYTES / (1024 * 1024))} MB. Remove some media in Anki and export again.`);
    }
    total += m.data.length;
    await db.deckMedia.create({ data: { deckId, name: m.name, mime: m.mime, data: new Uint8Array(m.data) } });
  }
}
