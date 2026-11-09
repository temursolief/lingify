import "server-only";
import { db } from "./db";
import { firstDue } from "./srs";
import { dayOf } from "./time";

export async function wordSets(userId: string) {
  const rows = await db.lemmaState.findMany({ where: { userId }, select: { lemma: true, status: true } });
  const known = new Set<string>();
  const learning = new Set<string>();
  for (const r of rows) (r.status === "KNOWN" ? known : learning).add(r.lemma);
  return { known, learning };
}

export async function recordSnapshot(userId: string) {
  const [knownCount, learningCount] = await Promise.all([
    db.lemmaState.count({ where: { userId, status: "KNOWN" } }),
    db.lemmaState.count({ where: { userId, status: "LEARNING" } }),
  ]);
  const day = dayOf(new Date());
  await db.vocabSnapshot.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, knownCount, learningCount },
    update: { knownCount, learningCount },
  });
}

/** Looking a word up means the student does not know it yet: it enters (or returns to) the learning queue. */
export async function markLookedUp(
  userId: string,
  lemma: string,
  context: { sentence: string; word: string; textId: string },
) {
  const now = new Date();
  const existing = await db.lemmaState.findUnique({ where: { userId_lemma: { userId, lemma } } });
  const fresh = {
    status: "LEARNING" as const,
    contextSentence: context.sentence,
    contextWord: context.word,
    contextTextId: context.textId,
    srsDue: firstDue(now),
    srsInterval: 0,
    srsStreak: 0,
    knownAt: null,
  };

  if (!existing) {
    await db.lemmaState.create({ data: { userId, lemma, source: "LOOKUP", lookups: 1, ...fresh } });
  } else if (existing.status === "KNOWN") {
    await db.lemmaState.update({
      where: { userId_lemma: { userId, lemma } },
      data: { ...fresh, source: "LOOKUP", lookups: { increment: 1 }, srsLapses: { increment: 1 } },
    });
  } else {
    await db.lemmaState.update({
      where: { userId_lemma: { userId, lemma } },
      data: { lookups: { increment: 1 } },
    });
  }
}
