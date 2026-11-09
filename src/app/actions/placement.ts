"use server";

import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildStage, knownLemmasFromPlacement, needsStageTwo, scorePlacement, type PlacementItem } from "@/lib/placement";
import { libraryFor } from "@/lib/recommend";
import { TOPICS } from "@/lib/topics";
import { recordSnapshot } from "@/lib/vocab";

type StoredItem = PlacementItem & { stage: 1 | 2 };

export async function saveTopics(topics: string[]) {
  const user = await requireStudent({ allowWithoutPlacement: true });
  const valid = z.array(z.enum(TOPICS)).parse(topics);
  await db.user.update({ where: { id: user.id }, data: { topicPrefs: valid } });
}

export async function startPlacement(): Promise<{ testId: string; words: string[] }> {
  const user = await requireStudent({ allowWithoutPlacement: true });
  const items: StoredItem[] = buildStage(1).map((i) => ({ ...i, stage: 1 }));
  const test = await db.placementTest.create({ data: { userId: user.id, items } });
  return { testId: test.id, words: items.map((i) => i.word) };
}

export type PlacementOutcome =
  | { done: false; words: string[] }
  | { done: true; estimate: number; unlocked: number; total: number; falseAlarmRate: number };

export async function submitPlacementStage(testId: string, knownWords: string[]): Promise<PlacementOutcome> {
  const user = await requireStudent({ allowWithoutPlacement: true });
  const test = await db.placementTest.findFirst({ where: { id: testId, userId: user.id, completedAt: null } });
  if (!test) throw new Error("Placement test not found");

  const known = new Set(knownWords);
  const items = test.items as StoredItem[];
  const stage = Math.max(...items.map((i) => i.stage)) as 1 | 2;
  for (const item of items) if (item.stage === stage) item.answer = known.has(item.word);

  if (stage === 1 && needsStageTwo(items)) {
    const used = items.filter((i) => i.band === null).map((i) => i.word);
    const next: StoredItem[] = buildStage(2, used).map((i) => ({ ...i, stage: 2 }));
    await db.placementTest.update({ where: { id: test.id }, data: { items: [...items, ...next] } });
    return { done: false, words: next.map((i) => i.word) };
  }

  const { results, falseAlarmRate, estimate } = scorePlacement(items);
  const lemmas = knownLemmasFromPlacement(items, results);
  const now = new Date();

  await db.$transaction([
    db.placementTest.update({ where: { id: test.id }, data: { items, results, estimate, completedAt: now } }),
    db.lemmaState.deleteMany({ where: { userId: user.id, source: "PLACEMENT" } }),
    db.lemmaState.createMany({
      data: lemmas.map((lemma) => ({ userId: user.id, lemma, status: "KNOWN" as const, source: "PLACEMENT" as const, knownAt: now })),
      skipDuplicates: true,
    }),
    db.user.update({ where: { id: user.id }, data: { placementDone: true, estimatedVocab: estimate, lastActiveAt: now } }),
  ]);
  await recordSnapshot(user.id);

  const library = await libraryFor(user.id);
  return {
    done: true,
    estimate,
    unlocked: library.filter((t) => t.level !== "locked").length,
    total: library.length,
    falseAlarmRate,
  };
}
