"use server";

import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { applyReview } from "@/lib/review";
import type { ReviewResult } from "@/lib/review-grade";

const schema = z.object({ lemma: z.string().min(1), answer: z.string().max(80) });

export async function submitReview(input: z.infer<typeof schema>): Promise<ReviewResult> {
  const user = await requireStudent();
  const { lemma, answer } = schema.parse(input);
  const result = await applyReview(user.id, lemma, answer);
  if (!result) throw new Error("Word is not in your review queue");
  return result;
}
