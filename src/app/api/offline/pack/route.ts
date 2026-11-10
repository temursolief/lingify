import { createHash } from "node:crypto";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { DictionaryData } from "@/lib/dictionary";
import { glossaryEntry, type GlossaryEntry } from "@/lib/glossary";
import type { OfflineCard, OfflinePack, OfflineText } from "@/lib/offline-types";
import { libraryFor } from "@/lib/recommend";
import { pickContext } from "@/lib/contexts";
import { reviewQueue } from "@/lib/review-queue";
import type { LemmaCounts, Phrase, Token } from "@/lib/texts";
import { wordSets } from "@/lib/vocab";

/** Texts kept on the laptop: the teacher's assignments first, then the best suggestions. */
const OFFLINE_TEXTS = 6;
const OFFLINE_CARDS = 40;
const DAY_MS = 86_400_000;

/**
 * Everything the offline app needs, in one compact download. An ETag lets the laptop skip the download
 * entirely when nothing has changed since last time, which matters on slow connections.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") return new Response(null, { status: 401 });
  const userId = session.userId;

  const [user, library, { known, learning }, queue] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, uzbekGlosses: true } }),
    libraryFor(userId),
    wordSets(userId),
    reviewQueue(userId, { until: new Date(Date.now() + DAY_MS), size: OFFLINE_CARDS }),
  ]);

  const open = library.filter((t) => t.level !== "locked" && !t.completed);
  const chosen = [...open.filter((t) => t.assigned), ...open.filter((t) => !t.assigned)].slice(0, OFFLINE_TEXTS);
  const rows = await db.text.findMany({
    where: { id: { in: chosen.map((t) => t.id) } },
    select: { id: true, slug: true, title: true, genre: true, paragraphs: true, phrases: true, lemmaCounts: true },
  });
  const unknownLemmas = [...new Set(rows.flatMap((r) => Object.keys(r.lemmaCounts as LemmaCounts)).filter((l) => !known.has(l)))];
  const missing = unknownLemmas.filter((l) => !glossaryEntry(l));
  const dictionary = missing.length ? await db.dictionaryEntry.findMany({ where: { word: { in: missing }, found: true } }) : [];
  const fromDictionary = new Map(
    dictionary.map((d) => {
      const m = (d.data as DictionaryData).meanings[0];
      return [d.word, m ? { pos: m.partOfSpeech, definition: m.definition, uz: null } : null] as const;
    }),
  );

  const texts: OfflineText[] = chosen.flatMap((entry) => {
    const r = rows.find((row) => row.id === entry.id);
    if (!r) return [];
    const lemmas = Object.keys(r.lemmaCounts as LemmaCounts);
    const glosses: Record<string, GlossaryEntry> = {};
    for (const l of lemmas) {
      if (known.has(l)) continue;
      const g = glossaryEntry(l) ?? fromDictionary.get(l);
      if (g) glosses[l] = g;
    }
    return [
      {
        id: r.id,
        slug: r.slug,
        title: r.title,
        genre: r.genre,
        assigned: entry.assigned,
        paragraphs: r.paragraphs as Token[][],
        glosses,
        phrases: (r.phrases as Phrase[]).map(({ phrase, meaning, uz, marks }) => ({ phrase, meaning, uz, marks })),
        learning: lemmas.filter((l) => learning.has(l)),
      },
    ];
  });

  const states = await db.lemmaState.findMany({ where: { userId, lemma: { in: queue.cards.map((c) => c.lemma) } } });
  const stateOf = new Map(states.map((s) => [s.lemma, s]));
  const cards: OfflineCard[] = queue.cards.flatMap((card) => {
    const s = stateOf.get(card.lemma);
    if (!s || s.status === "SEEN" || !s.srsDue) return [];
    return [
      {
        ...card,
        answer: pickContext(s).word,
        dueAt: s.srsDue.toISOString(),
        state: { status: s.status, srsInterval: s.srsInterval, srsEase: s.srsEase, srsStreak: s.srsStreak, srsReviews: s.srsReviews, srsLapses: s.srsLapses },
      },
    ];
  });

  const body: Omit<OfflinePack, "packedAt"> = { userId, name: user.name, uzbek: user.uzbekGlosses, texts, review: { mode: queue.mode, cards } };
  const json = JSON.stringify(body);
  const etag = `"${createHash("sha1").update(json).digest("base64url")}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return new Response(JSON.stringify({ ...body, packedAt: new Date().toISOString() }), {
    headers: { "Content-Type": "application/json", ETag: etag, "Cache-Control": "private, no-cache" },
  });
}
