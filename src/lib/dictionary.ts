import "server-only";
import { db } from "./db";

export type Meaning = { partOfSpeech: string; definition: string; example?: string };
export type DictionaryData = { phonetic?: string; audio?: string; meanings: Meaning[] };

const API = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const MAX_MEANINGS = 3;
/** Entries that were not found are retried after this long, in case the API was down. */
const RETRY_MISSING_MS = 7 * 86_400_000;

type ApiEntry = {
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[];
};

function simplify(entries: ApiEntry[]): DictionaryData {
  const phonetics = entries.flatMap((e) => e.phonetics ?? []);
  const meanings: Meaning[] = [];
  for (const entry of entries) {
    for (const m of entry.meanings ?? []) {
      const d = m.definitions[0];
      if (d && !meanings.some((x) => x.partOfSpeech === m.partOfSpeech)) {
        meanings.push({ partOfSpeech: m.partOfSpeech, definition: d.definition, example: d.example });
      }
    }
  }
  return {
    phonetic: entries.find((e) => e.phonetic)?.phonetic ?? phonetics.find((p) => p.text)?.text,
    audio: phonetics.find((p) => p.audio)?.audio || undefined,
    meanings: meanings.slice(0, MAX_MEANINGS),
  };
}

export async function lookupDefinition(word: string): Promise<DictionaryData | null> {
  const cached = await db.dictionaryEntry.findUnique({ where: { word } });
  if (cached && (cached.found || Date.now() - cached.fetchedAt.getTime() < RETRY_MISSING_MS)) {
    return cached.found ? (cached.data as DictionaryData) : null;
  }

  let data: DictionaryData | null = null;
  try {
    const res = await fetch(API + encodeURIComponent(word), { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      data = simplify((await res.json()) as ApiEntry[]);
      if (!data.meanings.length) data = null;
    } else if (res.status !== 404) {
      return null;
    }
  } catch {
    return null;
  }

  await db.dictionaryEntry.upsert({
    where: { word },
    create: { word, found: !!data, data: data ?? undefined },
    update: { found: !!data, data: data ?? undefined, fetchedAt: new Date() },
  });
  return data;
}
