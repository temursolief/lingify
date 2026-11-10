"use server";

import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { pickContext } from "@/lib/contexts";
import { MAINTENANCE_FIRST_DAYS, maintain, schedule } from "@/lib/srs";
import { recordSnapshot } from "@/lib/vocab";

const schema = z.object({ lemma: z.string().min(1), answer: z.string().max(80) });

export type ReviewResult = { correct: boolean; expected: string; graduated: boolean; forgotten: boolean; nextInDays: number | null };

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[’‘]/g, "'");
}

export async function submitReview(input: z.infer<typeof schema>): Promise<ReviewResult> {
  const user = await requireStudent();
  const { lemma, answer } = schema.parse(input);
  const state = await db.lemmaState.findUnique({ where: { userId_lemma: { userId: user.id, lemma } } });
  if (!state || state.status === "SEEN") throw new Error("Word is not in your review queue");

  const expected = pickContext(state).word;
  const given = normalize(answer);
  const correct = given === normalize(expected) || given === lemma;
  const now = new Date();
  const checkup = state.status === "KNOWN";
  const next = checkup ? maintain(state, correct, now) : { ...schedule(state, correct, now), forgotten: false };
  // A newly learned word gets its first check-up a month later.
  const srsDue = next.graduated ? new Date(now.getTime() + MAINTENANCE_FIRST_DAYS * 86_400_000) : next.srsDue;

  await db.$transaction([
    db.lemmaState.update({
      where: { userId_lemma: { userId: user.id, lemma } },
      data: {
        srsInterval: next.graduated ? MAINTENANCE_FIRST_DAYS : next.srsInterval,
        srsEase: next.srsEase,
        srsStreak: next.srsStreak,
        srsReviews: next.srsReviews,
        srsLapses: next.srsLapses,
        srsDue,
        ...(next.graduated ? { status: "KNOWN" as const, knownAt: now } : {}),
        ...(next.forgotten ? { status: "LEARNING" as const, knownAt: null } : {}),
      },
    }),
    db.exerciseAttempt.create({ data: { userId: user.id, kind: "REVIEW", itemKey: lemma, correct } }),
    db.user.update({ where: { id: user.id }, data: { lastActiveAt: now } }),
  ]);
  if (next.graduated || next.forgotten) await recordSnapshot(user.id);
  return {
    correct,
    expected,
    graduated: next.graduated,
    forgotten: next.forgotten,
    nextInDays: srsDue ? Math.round((srsDue.getTime() - now.getTime()) / 86_400_000) : null,
  };
}
