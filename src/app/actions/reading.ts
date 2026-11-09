"use server";

import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { lookupDefinition, type DictionaryData } from "@/lib/dictionary";
import { coverageOf, MIN_COVERAGE, type GrammarPoint, type LemmaCounts, type Question, type Token } from "@/lib/texts";
import { markLookedUp, recordSnapshot, wordSets } from "@/lib/vocab";

const RESUME_WITHIN_MS = 12 * 3_600_000;
/** Below this much active reading time the WPM figure would be noise. */
const MIN_SECONDS_FOR_WPM = 20;
/** Faster than this means the text was skimmed, not read; the session still counts but its speed is left out of trends. */
const MAX_PLAUSIBLE_WPM = 400;

async function ownSession(sessionId: string, userId: string) {
  const session = await db.readingSession.findFirst({ where: { id: sessionId, userId }, include: { text: true } });
  if (!session) throw new Error("Reading session not found");
  return session;
}

export async function startReading(textId: string): Promise<{ sessionId: string }> {
  const user = await requireStudent();
  const text = await db.text.findUniqueOrThrow({ where: { id: textId } });
  const { known } = await wordSets(user.id);
  const { coverage } = coverageOf(text.lemmaCounts as LemmaCounts, known);
  if (coverage < MIN_COVERAGE) throw new Error("This text is above your current level");

  const open = await db.readingSession.findFirst({
    where: { userId: user.id, textId, completedAt: null, startedAt: { gte: new Date(Date.now() - RESUME_WITHIN_MS) } },
    orderBy: { startedAt: "desc" },
  });
  if (open) return { sessionId: open.id };

  const session = await db.readingSession.create({ data: { userId: user.id, textId, coverage } });
  await db.event.create({ data: { userId: user.id, type: "text_opened", textId } });
  return { sessionId: session.id };
}

const lookupSchema = z.object({
  sessionId: z.string(),
  lemma: z.string().min(1).max(60),
  word: z.string().min(1).max(60),
  sentenceIndex: z.number().int().min(0),
});

export async function lookupWord(input: z.infer<typeof lookupSchema>): Promise<DictionaryData | null> {
  const user = await requireStudent();
  const { sessionId, lemma, word, sentenceIndex } = lookupSchema.parse(input);
  const session = await ownSession(sessionId, user.id);
  const counts = session.text.lemmaCounts as LemmaCounts;
  if (!(lemma in counts)) throw new Error("Word is not in this text");

  await markLookedUp(user.id, lemma, {
    sentence: session.text.sentences[sentenceIndex] ?? "",
    word,
    textId: session.textId,
  });
  await Promise.all([
    db.readingSession.update({ where: { id: session.id }, data: { lookupCount: { increment: 1 } } }),
    db.event.create({ data: { userId: user.id, type: "lookup", textId: session.textId, data: { sessionId, lemma, word } } }),
  ]);
  return lookupDefinition(lemma);
}

export async function completeReading(sessionId: string): Promise<{ wpm: number | null }> {
  const user = await requireStudent();
  const session = await ownSession(sessionId, user.id);
  if (session.completedAt) return { wpm: session.wpm };

  const now = new Date();
  const rawWpm = session.activeSeconds >= MIN_SECONDS_FOR_WPM ? session.text.wordCount / (session.activeSeconds / 60) : null;
  const wpm = rawWpm !== null && rawWpm <= MAX_PLAUSIBLE_WPM ? rawWpm : null;
  const lemmas = Object.keys(session.text.lemmaCounts as LemmaCounts);

  await db.$transaction([
    db.readingSession.update({ where: { id: session.id }, data: { completedAt: now, wpm } }),
    db.lemmaState.updateMany({ where: { userId: user.id, status: "LEARNING", lemma: { in: lemmas } }, data: { exposures: { increment: 1 } } }),
    db.assignmentRecipient.updateMany({
      where: { studentId: user.id, completedAt: null, assignment: { kind: "TEXT", textId: session.textId } },
      data: { completedAt: now },
    }),
    db.event.create({ data: { userId: user.id, type: "text_completed", textId: session.textId, data: { sessionId, wpm } } }),
    db.user.update({ where: { id: user.id }, data: { lastActiveAt: now } }),
  ]);
  await recordSnapshot(user.id);
  return { wpm: wpm && Math.round(wpm) };
}

export type AnswerFeedback = { correct: boolean; answer: number; explanation: string };

const answerSchema = z.object({
  sessionId: z.string(),
  kind: z.enum(["COMPREHENSION", "GRAMMAR"]),
  index: z.number().int().min(0),
  choice: z.number().int().min(0),
});

export async function answerQuestion(input: z.infer<typeof answerSchema>): Promise<AnswerFeedback> {
  const user = await requireStudent();
  const { sessionId, kind, index, choice } = answerSchema.parse(input);
  const session = await ownSession(sessionId, user.id);
  const question: Question | undefined =
    kind === "COMPREHENSION"
      ? (session.text.questions as Question[])[index]
      : (session.text.grammar as GrammarPoint[])[index]?.exercise;
  if (!question) throw new Error("Question not found");

  const correct = choice === question.answer;
  await db.exerciseAttempt.create({
    data: { userId: user.id, textId: session.textId, kind, itemKey: `${session.textId}:${kind}:${index}`, correct },
  });

  if (kind === "COMPREHENSION") {
    const questions = session.text.questions as Question[];
    const attempts = await db.exerciseAttempt.findMany({
      where: { userId: user.id, textId: session.textId, kind: "COMPREHENSION", answeredAt: { gte: session.startedAt } },
      orderBy: { answeredAt: "asc" },
    });
    const firstTry = new Map<string, boolean>();
    for (const a of attempts) if (!firstTry.has(a.itemKey)) firstTry.set(a.itemKey, a.correct);
    if (firstTry.size === questions.length) {
      const score = [...firstTry.values()].filter(Boolean).length / questions.length;
      await db.readingSession.update({ where: { id: session.id }, data: { quizScore: score } });
    }
  }
  return { correct, answer: question.answer, explanation: question.explanation };
}

const vocabSchema = z.object({ sessionId: z.string(), lemma: z.string(), choice: z.string() });

export async function answerVocab(input: z.infer<typeof vocabSchema>): Promise<{ correct: boolean; answer: string }> {
  const user = await requireStudent();
  const { sessionId, lemma, choice } = vocabSchema.parse(input);
  const session = await ownSession(sessionId, user.id);
  const token = (session.text.paragraphs as Token[][]).flat().find((t) => t.l === lemma);
  if (!token) throw new Error("Word not found in text");

  const correct = choice.toLowerCase() === token.v.toLowerCase();
  await db.exerciseAttempt.create({
    data: { userId: user.id, textId: session.textId, kind: "VOCAB", itemKey: `${session.textId}:VOCAB:${lemma}`, correct },
  });
  return { correct, answer: token.v };
}
