/**
 * Flashcards written as JSON instead of an Anki export: a key word with its meaning (and, if you like, an example
 * sentence and an Uzbek gloss), or a free front and back. Used for a listening lesson's key words and for the optional
 * `deck` of a passage file, so both come out looking the same as a card a student makes from a highlight.
 */
import { sanitizeHtml } from "./anki-template";
import type { DeckData } from "./passage-format";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type WordCard = { word: string; meaning: string; example?: string; uz?: string };
export type FreeCard = { front: string; back: string };

/**
 * A word card. With an example that contains the word, the front is that sentence with the word blanked out (the
 * learner recalls it from context); otherwise the front is the word itself. The back shows the sentence, the word,
 * its meaning and the Uzbek gloss.
 */
export function wordCardHtml(v: WordCard): { front: string; back: string } {
  const pattern = new RegExp(`\\b${v.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*`, "i");
  const front = v.example && pattern.test(v.example) ? `<div class="sentence">${esc(v.example).replace(pattern, '<span class="cloze">[...]</span>')}</div>` : `<div class="chunk">${esc(v.word)}</div>`;
  const back = [
    v.example ? `<div class="sentence">${esc(v.example)}</div><hr>` : "",
    `<div class="chunk">${esc(v.word)}</div>`,
    `<div class="meaning">${esc(v.meaning)}</div>`,
    v.uz ? `<div class="uz">O‘zbekcha: ${esc(v.uz)}</div>` : "",
  ].join("");
  return { front, back };
}

/** A free card: the teacher's own HTML, cleaned of scripts and event handlers because students will see it. */
export function freeCardHtml(c: FreeCard): { front: string; back: string } {
  return { front: sanitizeHtml(c.front), back: sanitizeHtml(c.back) };
}

/**
 * The database rows for a passage file's `deck`. Word cards use the "chunk" note type, which has the same styling as
 * cards made from highlights; free cards are plain. Each gets a stable `json:N` note ID so a later change can tell
 * them apart from cards that came from an Anki export.
 */
export function deckCardRows(deck: DeckData) {
  return deck.cards.map((c, position) => {
    const free = c.front !== undefined;
    const html = free ? freeCardHtml({ front: c.front!, back: c.back! }) : wordCardHtml({ word: c.word!, meaning: c.meaning!, example: c.example || undefined, uz: c.uz || undefined });
    return { ...html, noteType: free ? "basic" : "chunk", position, ankiNoteId: `json:${position}` };
  });
}
