import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { addContext, INCIDENTAL_ENCOUNTERS, INCIDENTAL_TEXTS, type WordContext } from "./contexts";
import { db } from "./db";
import { firstDue } from "./srs";
import type { LemmaCounts, Token } from "./texts";
import { dayOf } from "./time";

export async function wordSets(userId: string) {
  const rows = await db.lemmaState.findMany({ where: { userId, isPhrase: false, status: { in: ["KNOWN", "LEARNING"] } }, select: { lemma: true, status: true } });
  const known = new Set<string>();
  const learning = new Set<string>();
  for (const r of rows) (r.status === "KNOWN" ? known : learning).add(r.lemma);
  return { known, learning };
}

/** Items due for review now: learning words plus known words due a check-up. */
export const dueWhere = (userId: string, now = new Date()): Prisma.LemmaStateWhereInput => ({
  userId,
  status: { in: ["LEARNING", "KNOWN"] },
  srsDue: { lte: now },
});

export async function recordSnapshot(userId: string) {
  const [knownCount, learningCount] = await Promise.all([
    db.lemmaState.count({ where: { userId, status: "KNOWN", isPhrase: false } }),
    db.lemmaState.count({ where: { userId, status: "LEARNING" } }),
  ]);
  const day = dayOf(new Date());
  await db.vocabSnapshot.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, knownCount, learningCount },
    update: { knownCount, learningCount },
  });
}

function startLearning(context: WordContext, contexts: unknown) {
  return {
    status: "LEARNING" as const,
    contextSentence: context.sentence,
    contextWord: context.word,
    contextTextId: context.textId,
    contexts: addContext(contexts, context),
    srsDue: firstDue(new Date()),
    srsInterval: 0,
    srsStreak: 0,
    knownAt: null,
  };
}

/** Looking a word up means the student does not know it yet: it enters (or returns to) the learning queue. */
export async function markLookedUp(userId: string, lemma: string, context: WordContext) {
  const existing = await db.lemmaState.findUnique({ where: { userId_lemma: { userId, lemma } } });
  if (!existing) {
    await db.lemmaState.create({ data: { userId, lemma, source: "LOOKUP", lookups: 1, ...startLearning(context, []) } });
  } else if (existing.status !== "LEARNING") {
    await db.lemmaState.update({
      where: { userId_lemma: { userId, lemma } },
      data: {
        ...startLearning(context, existing.contexts),
        source: "LOOKUP",
        lookups: { increment: 1 },
        ...(existing.status === "KNOWN" ? { srsLapses: { increment: 1 } } : {}),
      },
    });
  } else {
    await db.lemmaState.update({
      where: { userId_lemma: { userId, lemma } },
      data: { lookups: { increment: 1 }, contexts: addContext(existing.contexts, context) },
    });
  }
}

/** Adds a word to the learning queue without counting it as a lookup; words already known are left alone. */
export async function addToLearning(userId: string, lemma: string, context: WordContext) {
  const existing = await db.lemmaState.findUnique({ where: { userId_lemma: { userId, lemma } } });
  if (existing && existing.status !== "SEEN") return;
  if (existing) {
    await db.lemmaState.update({ where: { userId_lemma: { userId, lemma } }, data: { ...startLearning(context, existing.contexts), source: "LOOKUP" } });
  } else {
    await db.lemmaState.create({ data: { userId, lemma, source: "LOOKUP", ...startLearning(context, []) } });
  }
}

/**
 * After a finished text: learning words count an exposure and gain this text's sentence as a new review context;
 * unknown words are counted as encounters, and enough encounters across texts make a word known (incidental learning).
 */
export async function recordReading(userId: string, text: { id: string; paragraphs: unknown; sentences: string[]; lemmaCounts: unknown }) {
  const counts = text.lemmaCounts as LemmaCounts;
  const tokens = (text.paragraphs as Token[][]).flat();
  const firstToken = new Map<string, Token>();
  for (const t of tokens) if (t.l && !firstToken.has(t.l)) firstToken.set(t.l, t);
  const lemmas = Object.keys(counts);
  const states = await db.lemmaState.findMany({ where: { userId, lemma: { in: lemmas } } });
  const byLemma = new Map(states.map((s) => [s.lemma, s]));
  const now = new Date();
  const contextFor = (lemma: string): WordContext => {
    const t = firstToken.get(lemma)!;
    return { sentence: text.sentences[t.i], word: t.v, textId: text.id };
  };

  const fresh = lemmas.filter((l) => !byLemma.has(l));
  if (fresh.length) {
    await db.lemmaState.createMany({
      data: fresh.map((lemma) => ({
        userId,
        lemma,
        status: "SEEN" as const,
        source: "READING" as const,
        encounters: counts[lemma],
        contexts: [contextFor(lemma)],
      })),
      skipDuplicates: true,
    });
  }

  let learned = 0;
  for (const s of states) {
    if (s.contexts && (s.contexts as WordContext[]).some((c) => c.textId === text.id)) continue;
    const contexts = addContext(s.contexts, contextFor(s.lemma));
    if (s.status === "LEARNING") {
      await db.lemmaState.update({ where: { userId_lemma: { userId, lemma: s.lemma } }, data: { exposures: { increment: 1 }, contexts } });
    } else if (s.status === "SEEN") {
      const encounters = s.encounters + counts[s.lemma];
      const becomesKnown = encounters >= INCIDENTAL_ENCOUNTERS && contexts.length >= INCIDENTAL_TEXTS;
      if (becomesKnown) learned++;
      await db.lemmaState.update({
        where: { userId_lemma: { userId, lemma: s.lemma } },
        data: { encounters, contexts, ...(becomesKnown ? { status: "KNOWN", knownAt: now, srsDue: null } : {}) },
      });
    }
  }
  return { pickedUp: learned };
}
