import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import { lookupDefinition } from "./dictionary";
import { glossaryEntry } from "./glossary";

/**
 * The back of a highlight-made card: a short learner definition of the chunk and, when the project glossary has one,
 * an Uzbek translation. From the glossary first, then the free dictionary (single words only). Meanings saved earlier
 * in the ChunkMeaning table are still used. A lookup already on its way is shared rather than sent again (the card is
 * filled in the background while the page also asks for the meaning).
 */

export type ChunkMeaning = { meaning: string; uz: string | null; source: "saved" | "dictionary" | "none" };

const keyOf = (chunk: string, sentence: string) => createHash("sha1").update(`${chunk.toLowerCase()}\n${sentence}`).digest("hex");

/** Only what is known without going online: a saved meaning or the built-in glossary. */
export async function knownChunkMeaning(chunk: string, sentence: string): Promise<ChunkMeaning | null> {
  const saved = await db.chunkMeaning.findUnique({ where: { key: keyOf(chunk, sentence) } });
  if (saved) return { meaning: saved.meaning, uz: saved.uz, source: "saved" };
  const glossary = glossaryEntry(chunk.toLowerCase().trim());
  return glossary ? { meaning: glossary.definition, uz: glossary.uz, source: "dictionary" } : null;
}

const inFlight = new Map<string, Promise<ChunkMeaning>>();

export function chunkMeaning(chunk: string, sentence: string): Promise<ChunkMeaning> {
  const key = keyOf(chunk, sentence);
  let pending = inFlight.get(key);
  if (!pending) {
    pending = findChunkMeaning(chunk, sentence).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

async function findChunkMeaning(chunk: string, sentence: string): Promise<ChunkMeaning> {
  const known = await knownChunkMeaning(chunk, sentence);
  if (known) return known;
  const word = chunk.toLowerCase().trim();
  if (!/\s/.test(word)) {
    const entry = await lookupDefinition(word).catch(() => null);
    const first = entry?.meanings[0];
    if (first) return { meaning: first.definition, uz: null, source: "dictionary" };
  }
  return { meaning: "", uz: null, source: "none" };
}
