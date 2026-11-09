"use server";

import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { lookupDefinition, type DictionaryData } from "@/lib/dictionary";
import { glossaryEntry, guessOptions, type GlossaryEntry } from "@/lib/glossary";
import { phraseQuestion } from "@/lib/lesson";
import { firstDue } from "@/lib/srs";
import {
  coverageOf,
  MIN_COVERAGE,
  type Choice,
  type GrammarPoint,
  type LemmaCounts,
  type Phrase,
  type PreTeachWord,
  type Question,
  type SkillQuestion,
  type Token,
} from "@/lib/texts";
import { addToLearning, markLookedUp, recordSnapshot, wordSets } from "@/lib/vocab";

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

function sentenceWith(paragraphs: Token[][], sentences: string[], lemma: string) {
  const token = paragraphs.flat().find((t) => t.l === lemma);
  return token ? { sentence: sentences[token.i], word: token.v } : null;
}

export async function startReading(textId: string): Promise<{ sessionId: string }> {
  const user = await requireStudent();
  const text = await db.text.findUniqueOrThrow({ where: { id: textId } });
  const { known } = await wordSets(user.id);
  const { coverage } = coverageOf(text.lemmaCounts as LemmaCounts, known);
  if (coverage < MIN_COVERAGE) throw new Error("This text is above your current level");

  const open = await db.readingSession.findFirst({
    where: { userId: user.id, textId, completedAt: null, abandonedAt: null, startedAt: { gte: new Date(Date.now() - RESUME_WITHIN_MS) } },
    orderBy: { startedAt: "desc" },
  });
  if (open) return { sessionId: open.id };

  const session = await db.readingSession.create({ data: { userId: user.id, textId, coverage } });
  await db.event.create({ data: { userId: user.id, type: "text_opened", textId } });
  return { sessionId: session.id };
}

export async function savePrediction(input: { sessionId: string; choice: number }) {
  const user = await requireStudent();
  const { sessionId, choice } = z.object({ sessionId: z.string(), choice: z.number().int().min(0).max(5) }).parse(input);
  await db.readingSession.updateMany({ where: { id: sessionId, userId: user.id }, data: { prediction: choice } });
}

/** Pre-taught words go into the learning queue with the sentence they appear in, unless already known. */
export async function addPreTaught(sessionId: string) {
  const user = await requireStudent();
  const session = await ownSession(sessionId, user.id);
  const paragraphs = session.text.paragraphs as Token[][];
  for (const w of session.text.preTeach as PreTeachWord[]) {
    const context = sentenceWith(paragraphs, session.text.sentences, w.lemma);
    await addToLearning(user.id, w.lemma, { sentence: context?.sentence ?? "", word: context?.word ?? w.word, textId: session.textId });
  }
}

const lookupSchema = z.object({
  sessionId: z.string(),
  lemma: z.string().min(1).max(60),
  word: z.string().min(1).max(60),
  sentenceIndex: z.number().int().min(0),
});

export type LookupResult = { entry: GlossaryEntry | null; guess: string[] | null };

export async function lookupWord(input: z.infer<typeof lookupSchema>): Promise<LookupResult> {
  const user = await requireStudent();
  const { sessionId, lemma, word, sentenceIndex } = lookupSchema.parse(input);
  const session = await ownSession(sessionId, user.id);
  if (!(lemma in (session.text.lemmaCounts as LemmaCounts))) throw new Error("Word is not in this text");

  await markLookedUp(user.id, lemma, { sentence: session.text.sentences[sentenceIndex] ?? "", word, textId: session.textId });
  await Promise.all([
    db.readingSession.update({ where: { id: session.id }, data: { lookupCount: { increment: 1 } } }),
    db.event.create({ data: { userId: user.id, type: "lookup", textId: session.textId, data: { sessionId, lemma, word } } }),
  ]);
  return { entry: glossaryEntry(lemma), guess: guessOptions(lemma)?.options ?? null };
}

/** Checks a "guess the meaning from context" answer before the definition is shown. */
export async function guessWord(input: { sessionId: string; lemma: string; choice: number }): Promise<{ correct: boolean; answer: number }> {
  const user = await requireStudent();
  const { sessionId, lemma, choice } = z.object({ sessionId: z.string(), lemma: z.string(), choice: z.number().int() }).parse(input);
  const session = await ownSession(sessionId, user.id);
  const guess = guessOptions(lemma);
  if (!guess) throw new Error("No guessing exercise for this word");
  const correct = choice === guess.answer;
  await db.exerciseAttempt.create({
    data: { userId: user.id, textId: session.textId, kind: "GUESS", itemKey: `${session.textId}:GUESS:${lemma}`, skill: "vocabulary", correct },
  });
  return { correct, answer: guess.answer };
}

export async function dictionaryFor(lemma: string): Promise<DictionaryData | null> {
  await requireStudent();
  return lookupDefinition(z.string().min(1).max(60).parse(lemma));
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
    db.readingSession.update({ where: { id: session.id }, data: { completedAt: now, wpm, abandonedAt: null, abandonReason: null } }),
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

/** Stopping a text is a normal reader's choice: nothing is marked as failed, and the reason tunes recommendations. */
export async function abandonReading(input: { sessionId: string; reason: "TOO_HARD" | "NOT_INTERESTED" | "NO_TIME" }) {
  const user = await requireStudent();
  const { sessionId, reason } = z
    .object({ sessionId: z.string(), reason: z.enum(["TOO_HARD", "NOT_INTERESTED", "NO_TIME"]) })
    .parse(input);
  await db.readingSession.updateMany({
    where: { id: sessionId, userId: user.id, completedAt: null },
    data: { abandonedAt: new Date(), abandonReason: reason },
  });
}

export type AnswerFeedback = { correct: boolean; answer: number; explanation: string };

const answerSchema = z.object({
  sessionId: z.string(),
  kind: z.enum(["COMPREHENSION", "GIST", "CCQ", "GRAMMAR", "DISCOVERY", "PHRASE"]),
  index: z.number().int().min(0),
  choice: z.number().int().min(0),
});

export async function answerItem(input: z.infer<typeof answerSchema>): Promise<AnswerFeedback> {
  const user = await requireStudent();
  const { sessionId, kind, index, choice } = answerSchema.parse(input);
  const session = await ownSession(sessionId, user.id);
  const text = session.text;
  const grammar = text.grammar as GrammarPoint[];

  let item: (Choice & { explanation?: string }) | undefined;
  let skill: string | null = null;
  switch (kind) {
    case "COMPREHENSION": {
      const q = (text.questions as SkillQuestion[])[index];
      item = q;
      skill = q?.skill ?? null;
      break;
    }
    case "GIST":
      item = text.gist as Question;
      skill = "gist";
      break;
    case "CCQ":
      item = (text.preTeach as PreTeachWord[])[index]?.ccq;
      break;
    case "GRAMMAR":
      item = grammar[index]?.exercise;
      skill = grammar[index]?.key ?? null;
      break;
    case "DISCOVERY":
      item = grammar[index]?.discovery;
      skill = grammar[index]?.key ?? null;
      break;
    case "PHRASE": {
      const phrases = text.phrases as Phrase[];
      if (phrases[index]) {
        item = { ...phraseQuestion(phrases, index), explanation: `“${phrases[index].phrase}” means ${phrases[index].meaning}.` };
      }
      break;
    }
  }
  if (!item) throw new Error("Question not found");

  const correct = choice === item.answer;
  await db.exerciseAttempt.create({
    data: { userId: user.id, textId: session.textId, kind, itemKey: `${session.textId}:${kind}:${index}`, skill, correct },
  });

  if (kind === "GIST") {
    await db.readingSession.update({ where: { id: session.id }, data: { gistCorrect: correct } });
  }
  if (kind === "COMPREHENSION") {
    const questions = text.questions as Question[];
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
  return { correct, answer: item.answer, explanation: item.explanation ?? "" };
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

/** Saves a useful phrase (a lexical chunk) to the review queue, with the sentence it came from. */
export async function savePhrase(input: { sessionId: string; index: number }) {
  const user = await requireStudent();
  const { sessionId, index } = z.object({ sessionId: z.string(), index: z.number().int().min(0) }).parse(input);
  const session = await ownSession(sessionId, user.id);
  const phrase = (session.text.phrases as Phrase[])[index];
  if (!phrase) throw new Error("Phrase not found");
  const paragraphs = session.text.paragraphs as Token[][];
  const mark = phrase.marks[0];
  const tokens = paragraphs[mark.p].slice(mark.from, mark.to + 1);
  const surface = tokens.map((t, i) => (i ? t.s : "") + t.v).join("");
  const key = phrase.phrase.toLowerCase();

  await db.lemmaState.upsert({
    where: { userId_lemma: { userId: user.id, lemma: key } },
    create: {
      userId: user.id,
      lemma: key,
      status: "LEARNING",
      source: "LOOKUP",
      isPhrase: true,
      meaning: phrase.meaning,
      contextSentence: session.text.sentences[tokens[0].i],
      contextWord: surface,
      contextTextId: session.textId,
      srsDue: firstDue(new Date()),
    },
    update: { meaning: phrase.meaning, isPhrase: true },
  });
}

const ratingSchema = z.object({
  textId: z.string(),
  enjoyment: z.number().int().min(1).max(3),
  difficulty: z.number().int().min(-1).max(1),
  recommend: z.boolean(),
});

export async function rateText(input: z.infer<typeof ratingSchema>) {
  const user = await requireStudent();
  const data = ratingSchema.parse(input);
  await db.textRating.upsert({
    where: { userId_textId: { userId: user.id, textId: data.textId } },
    create: { userId: user.id, ...data },
    update: { enjoyment: data.enjoyment, difficulty: data.difficulty, recommend: data.recommend },
  });
}
