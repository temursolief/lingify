"use server";

import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { answerKey, type QuestionGroup } from "@/lib/passage-format";
import { latestAttempt, passageVisibleTo, retryQuestion, submitFirst, tagQuestion, viewOf, type AttemptView } from "@/lib/passages";

const evidence = z.object({ paragraph: z.number().int().min(0).max(25), start: z.number().int().min(0), end: z.number().int().min(0), text: z.string().max(1500) });

async function visiblePassage(userId: string, passageId: string) {
  const passage = await db.passage.findFirst({ where: { id: passageId, ...passageVisibleTo(userId) } });
  if (!passage) throw new Error("Passage not found");
  return passage;
}

async function currentView(userId: string, passageId: string): Promise<AttemptView> {
  const passage = await visiblePassage(userId, passageId);
  const attempt = await latestAttempt(userId, passageId);
  return viewOf(attempt!, passage.groups as QuestionGroup[]);
}

/** Opens a passage: the latest attempt, or a new one. */
export async function startAttempt(passageId: string): Promise<AttemptView> {
  const user = await requireStudent();
  const passage = await visiblePassage(user.id, passageId);
  const existing = await latestAttempt(user.id, passageId);
  if (existing) return viewOf(existing, passage.groups as QuestionGroup[]);
  const total = answerKey(passage.groups as QuestionGroup[]).length;
  await db.passageAttempt.create({ data: { userId: user.id, passageId, total } });
  return currentView(user.id, passageId);
}

/** A fresh attempt after finishing one, to practise the passage again. */
export async function restartAttempt(passageId: string): Promise<AttemptView> {
  const user = await requireStudent();
  const passage = await visiblePassage(user.id, passageId);
  await db.passageAttempt.create({ data: { userId: user.id, passageId, total: answerKey(passage.groups as QuestionGroup[]).length } });
  return currentView(user.id, passageId);
}

const submitSchema = z.object({
  attemptId: z.string(),
  passageId: z.string(),
  answers: z.record(z.string(), z.string().max(120)),
  evidence: z.record(z.string(), evidence),
  seconds: z.number().int().min(0).max(4 * 3600),
});

export async function submitPassage(input: z.infer<typeof submitSchema>): Promise<AttemptView> {
  const user = await requireStudent();
  const { attemptId, passageId, answers, evidence, seconds } = submitSchema.parse(input);
  const toNumbers = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [Number(k), v]));
  await submitFirst(user.id, attemptId, toNumbers(answers), toNumbers(evidence), seconds);
  return currentView(user.id, passageId);
}

const retrySchema = z.object({ attemptId: z.string(), passageId: z.string(), number: z.number().int(), answer: z.string().max(120), evidence: evidence.nullable() });

export async function retryAnswer(input: z.infer<typeof retrySchema>): Promise<{ error?: string; view: AttemptView }> {
  const user = await requireStudent();
  const { attemptId, passageId, number, answer, evidence } = retrySchema.parse(input);
  const result = await retryQuestion(user.id, attemptId, number, answer, evidence);
  return { error: result.ok ? undefined : result.error, view: await currentView(user.id, passageId) };
}

const tagSchema = z.object({ attemptId: z.string(), passageId: z.string(), number: z.number().int(), tag: z.enum(["VOCAB", "DISTRACTOR", "LOGIC", "CARELESS"]) });

export async function tagMistake(input: z.infer<typeof tagSchema>): Promise<AttemptView> {
  const user = await requireStudent();
  const { attemptId, passageId, number, tag } = tagSchema.parse(input);
  await tagQuestion(user.id, attemptId, number, tag);
  return currentView(user.id, passageId);
}
