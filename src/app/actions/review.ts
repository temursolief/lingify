"use server";

import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { schedule } from "@/lib/srs";
import { recordSnapshot } from "@/lib/vocab";

const schema = z.object({ lemma: z.string().min(1), answer: z.string().max(80) });

export type ReviewResult = { correct: boolean; expected: string; graduated: boolean; nextInDays: number | null };

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[’‘]/g, "'");
}

export async function submitReview(input: z.infer<typeof schema>): Promise<ReviewResult> {
  const user = await requireStudent();
  const { lemma, answer } = schema.parse(input);
  const state = await db.lemmaState.findUnique({ where: { userId_lemma: { userId: user.id, lemma } } });
  if (!state || state.status !== "LEARNING") throw new Error("Word is not in your review queue");

  const expected = state.contextWord ?? lemma;
  const given = normalize(answer);
  const correct = given === normalize(expected) || given === lemma;
  const now = new Date();
  const next = schedule(state, correct, now);

  await db.$transaction([
    db.lemmaState.update({
      where: { userId_lemma: { userId: user.id, lemma } },
      data: {
        srsInterval: next.srsInterval,
        srsEase: next.srsEase,
        srsStreak: next.srsStreak,
        srsReviews: next.srsReviews,
        srsLapses: next.srsLapses,
        srsDue: next.srsDue,
        ...(next.graduated ? { status: "KNOWN" as const, knownAt: now } : {}),
      },
    }),
    db.exerciseAttempt.create({ data: { userId: user.id, kind: "REVIEW", itemKey: lemma, correct } }),
    db.user.update({ where: { id: user.id }, data: { lastActiveAt: now } }),
  ]);
  if (next.graduated) await recordSnapshot(user.id);
  return {
    correct,
    expected,
    graduated: next.graduated,
    nextInDays: next.srsDue ? Math.round((next.srsDue.getTime() - now.getTime()) / 86_400_000) : null,
  };
}
