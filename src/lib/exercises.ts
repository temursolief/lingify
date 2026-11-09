import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import type { Token } from "./texts";

export type VocabItem = { lemma: string; gapped: string; options: string[] };

/** Gap-fill items for the words this student met in the text and is still learning. */
export async function buildVocabItems(
  userId: string,
  text: { id: string; paragraphs: Prisma.JsonValue; sentences: string[] },
  since: Date,
  limit = 6,
): Promise<VocabItem[]> {
  const tokens = (text.paragraphs as Token[][]).flat();
  const textLemmas = new Set(tokens.map((t) => t.l).filter(Boolean) as string[]);
  const [lookups, learning] = await Promise.all([
    db.event.findMany({ where: { userId, type: "lookup", textId: text.id, at: { gte: since } }, orderBy: { at: "asc" } }),
    db.lemmaState.findMany({ where: { userId, status: "LEARNING", lemma: { in: [...textLemmas] } }, select: { lemma: true } }),
  ]);
  const targets = [
    ...new Set([
      ...lookups.map((e) => (e.data as { lemma: string }).lemma),
      ...learning.map((l) => l.lemma),
    ]),
  ].slice(0, limit);

  const pool = [...new Set(tokens.filter((t) => t.l && /^[a-z]+$/i.test(t.v) && t.v.length > 3).map((t) => t.v.toLowerCase()))];
  return targets.flatMap((lemma) => {
    const token = tokens.find((t) => t.l === lemma);
    if (!token) return [];
    const sentence = text.sentences[token.i];
    const gapped = sentence.replace(new RegExp(`\\b${token.v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`), "_____");
    if (gapped === sentence) return [];
    const distractors = pool
      .filter((w) => w !== token.v.toLowerCase() && !targets.includes(w))
      .map((w) => ({ w, d: Math.abs(w.length - token.v.length) + seeded(lemma + w) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.w);
    const options = [token.v.toLowerCase(), ...distractors].sort((a, b) => seeded(lemma + a) - seeded(lemma + b));
    return [{ lemma, gapped, options }];
  });
}

function seeded(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}
