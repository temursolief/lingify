import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyReview } from "@/lib/review";
import { coverageOf, type LemmaCounts } from "@/lib/texts";
import { markLookedUp, recordReading, recordSnapshot, wordSets } from "@/lib/vocab";

const MAX_ITEMS = 500;
/** Offline answers older than this are dropped rather than rewriting a long-gone schedule. */
const MAX_AGE_MS = 30 * 86_400_000;

const when = z.iso.datetime();
const schema = z.object({
  reviews: z.array(z.object({ lemma: z.string().min(1).max(80), answer: z.string().max(80), at: when })).max(MAX_ITEMS),
  lookups: z
    .array(z.object({ textId: z.string(), lemma: z.string().min(1).max(60), word: z.string().min(1).max(60), sentenceIndex: z.number().int().min(0), at: when }))
    .max(MAX_ITEMS),
  finished: z.array(z.object({ textId: z.string(), at: when })).max(50),
});

/** A sane timestamp from the laptop: never in the future, never older than a month. */
function clamp(at: string) {
  const t = Math.min(Date.parse(at), Date.now());
  return new Date(Math.max(t, Date.now() - MAX_AGE_MS));
}

/** Applies what the student did offline, in the order they did it. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") return new Response(null, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const userId = session.userId;
  const { reviews, lookups, finished } = parsed.data;

  const textIds = [...new Set([...lookups.map((l) => l.textId), ...finished.map((f) => f.textId)])];
  const texts = textIds.length
    ? await db.text.findMany({ where: { id: { in: textIds } }, select: { id: true, wordCount: true, paragraphs: true, sentences: true, lemmaCounts: true } })
    : [];
  const textById = new Map(texts.map((t) => [t.id, t]));

  for (const l of [...lookups].sort((a, b) => a.at.localeCompare(b.at))) {
    const text = textById.get(l.textId);
    if (!text || !(l.lemma in (text.lemmaCounts as LemmaCounts))) continue;
    await markLookedUp(userId, l.lemma, { sentence: text.sentences[l.sentenceIndex] ?? "", word: l.word, textId: text.id });
    await db.event.create({ data: { userId, type: "lookup", textId: text.id, at: clamp(l.at), data: { lemma: l.lemma, word: l.word, offline: true } } });
  }

  let reviewed = 0;
  for (const r of [...reviews].sort((a, b) => a.at.localeCompare(b.at))) {
    if (await applyReview(userId, r.lemma, r.answer, clamp(r.at))) reviewed++;
  }

  let read = 0;
  for (const f of finished) {
    const text = textById.get(f.textId);
    if (!text) continue;
    const at = clamp(f.at);
    const { coverage } = coverageOf(text.lemmaCounts as LemmaCounts, (await wordSets(userId)).known);
    await db.$transaction([
      db.readingSession.create({ data: { userId, textId: text.id, coverage, startedAt: at, completedAt: at } }),
      db.assignmentRecipient.updateMany({
        where: { studentId: userId, completedAt: null, assignment: { kind: "TEXT", textId: text.id } },
        data: { completedAt: at },
      }),
      db.event.create({ data: { userId, type: "text_completed", textId: text.id, at, data: { offline: true } } }),
    ]);
    await recordReading(userId, text);
    read++;
  }

  if (read) await recordSnapshot(userId);
  if (reviewed || read || lookups.length) await db.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } });
  return Response.json({ reviewed, lookups: lookups.length, read });
}
