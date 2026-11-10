import "server-only";
import { awlProgress } from "./awl";
import { db } from "./db";
import { wordSets } from "./vocab";
import { GRAMMAR_SEQUENCE, MASTERY_CORRECT, readyStage } from "./grammar-sequence";
import type { StudentStats } from "./stats";
import { READING_SKILLS, SKILL_LABEL, type ReadingSkill } from "./texts";
import { dayKey, dayOf } from "./time";

export type SkillScore = { skill: ReadingSkill; label: string; correct: number; total: number; accuracy: number | null };
export type CanDoStatus = "achieved" | "developing" | "not-yet";
export type CanDo = { id: string; statement: string; status: CanDoStatus; evidence: string };

/** A skill needs at least this many answers before we say anything about it. */
const MIN_EVIDENCE = 3;

export async function learningProfile(userId: string, stats: StudentStats) {
  const [attempts, guesses, grammarAttempts, runs, completed, ielts, words] = await Promise.all([
    db.exerciseAttempt.findMany({
      where: { userId, kind: { in: ["COMPREHENSION", "GIST"] }, skill: { not: null } },
      orderBy: { answeredAt: "asc" },
      select: { itemKey: true, skill: true, correct: true },
    }),
    db.exerciseAttempt.groupBy({ by: ["correct"], where: { userId, kind: "GUESS" }, _count: true }),
    db.exerciseAttempt.groupBy({ by: ["skill", "correct"], where: { userId, kind: "GRAMMAR", skill: { not: null } }, _count: true }),
    db.fluencyRun.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { wpm: true, createdAt: true, gistCorrect: true, text: { select: { title: true } } } }),
    db.readingSession.findMany({ where: { userId, completedAt: { not: null } }, select: { text: { select: { topics: true, genre: true } } } }),
    db.ieltsAttempt.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 3, select: { band: true } }),
    wordSets(userId),
  ]);
  const ieltsBand = ielts.length ? Math.round((ielts.reduce((n, a) => n + a.band, 0) / ielts.length) * 2) / 2 : null;
  const awl = awlProgress(words.known);
  const core = awl.sublists.slice(0, 3);
  const coreShare = core.reduce((n, s) => n + s.known, 0) / core.reduce((n, s) => n + s.total, 0);

  // First try only: retrying a question after seeing the answer says nothing about the skill.
  const firstTry = new Map<string, { skill: string; correct: boolean }>();
  for (const a of attempts) if (!firstTry.has(a.itemKey)) firstTry.set(a.itemKey, { skill: a.skill!, correct: a.correct });
  const skills: SkillScore[] = READING_SKILLS.map((skill) => {
    const rows = [...firstTry.values()].filter((r) => r.skill === skill);
    const correct = rows.filter((r) => r.correct).length;
    return { skill, label: SKILL_LABEL[skill], correct, total: rows.length, accuracy: rows.length ? correct / rows.length : null };
  });
  const scored = skills.filter((s) => s.total >= MIN_EVIDENCE && s.accuracy !== null);
  const weakest = scored.length ? scored.reduce((a, b) => (a.accuracy! <= b.accuracy! ? a : b)) : null;

  const guessTotal = guesses.reduce((n, g) => n + g._count, 0);
  const guessCorrect = guesses.filter((g) => g.correct).reduce((n, g) => n + g._count, 0);

  const correctByKey = new Map<string, number>();
  const seenKeys = new Set<string>();
  for (const g of grammarAttempts) {
    seenKeys.add(g.skill!);
    if (g.correct) correctByKey.set(g.skill!, (correctByKey.get(g.skill!) ?? 0) + g._count);
  }
  const mastered = new Set([...correctByKey].filter(([, n]) => n >= MASTERY_CORRECT).map(([k]) => k));
  const stage = readyStage(mastered);
  const grammar = GRAMMAR_SEQUENCE.map((g) => ({
    ...g,
    status: mastered.has(g.key) ? ("mastered" as const) : seenKeys.has(g.key) ? ("practising" as const) : ("new" as const),
  }));

  const topics = new Set(completed.flatMap((c) => c.text.topics));
  const genres = new Set(completed.map((c) => c.text.genre));
  // Skimmed runs (too fast, or the main idea missed) never count as real reading speed.
  const validRuns = runs.filter((r) => r.wpm <= 500 && r.gistCorrect !== false);
  const bestFluency = validRuns.length ? Math.max(...validRuns.map((r) => r.wpm)) : null;
  const bestReading = stats.wpmTrend.length ? Math.max(...stats.wpmTrend.map((p) => p.value)) : null;
  const bestWpm = Math.max(bestFluency ?? 0, bestReading ?? 0) || null;

  const acc = (...keys: ReadingSkill[]) => {
    const rows = skills.filter((s) => keys.includes(s.skill));
    const total = rows.reduce((n, r) => n + r.total, 0);
    return { total, accuracy: total ? rows.reduce((n, r) => n + r.correct, 0) / total : null };
  };
  const judge = (a: { total: number; accuracy: number | null }, target: number, min = MIN_EVIDENCE): CanDoStatus =>
    a.total === 0 || a.accuracy === null ? "not-yet" : a.total >= min && a.accuracy >= target ? "achieved" : "developing";
  const pct = (a: { total: number; accuracy: number | null }) =>
    a.accuracy === null ? "No answers yet" : `${Math.round(a.accuracy * 100)}% of ${a.total} answers`;

  const gist = acc("gist");
  const detail = acc("detail");
  const between = acc("inference", "attitude");
  const reference = acc("reference");
  const vocab = skills.find((s) => s.skill === "vocabulary")!;
  const contextTotal = guessTotal + vocab.total;
  const context = { total: contextTotal, accuracy: contextTotal ? (guessCorrect + vocab.correct) / contextTotal : null };
  const organisation = acc("organisation");

  const canDo: CanDo[] = [
    { id: "gist", statement: "I can understand the main idea of short stories and articles.", status: judge(gist, 0.7), evidence: pct(gist) },
    { id: "detail", statement: "I can find specific information in a text.", status: judge(detail, 0.75, 5), evidence: pct(detail) },
    { id: "inference", statement: "I can understand what people think and feel, even when it is not said directly.", status: judge(between, 0.65, 4), evidence: pct(between) },
    { id: "reference", statement: "I can follow what words like it, they and this refer to.", status: judge(reference, 0.7), evidence: pct(reference) },
    { id: "context", statement: "I can work out the meaning of new words from the sentence around them.", status: judge(context, 0.6, 5), evidence: pct(context) },
    { id: "organisation", statement: "I can understand how a text is organised.", status: judge(organisation, 0.7), evidence: pct(organisation) },
    {
      id: "range",
      statement: "I can read texts on many different topics.",
      status: topics.size >= 8 ? "achieved" : topics.size >= 3 ? "developing" : "not-yet",
      evidence: `${topics.size} topics, ${genres.size} types of text`,
    },
    {
      id: "fluency",
      statement: "I can read an easy 400-word text at 150 words per minute or faster.",
      status: bestWpm === null ? "not-yet" : bestWpm >= 150 ? "achieved" : bestWpm >= 100 ? "developing" : "not-yet",
      evidence: bestWpm ? `Best speed ${Math.round(bestWpm)} words per minute` : "No speed measured yet",
    },
    {
      id: "ielts",
      statement: "I can answer IELTS Academic reading questions at band 5.5 or above.",
      status: ieltsBand === null ? "not-yet" : ieltsBand >= 5.5 && ielts.length >= 2 ? "achieved" : "developing",
      evidence: ieltsBand === null ? "No IELTS practice yet" : `Estimated band ${ieltsBand} from ${ielts.length} passage${ielts.length === 1 ? "" : "s"}`,
    },
    {
      id: "academic",
      statement: "I know the most common academic words (Academic Word List, sublists 1–3).",
      status: coreShare >= 0.8 ? "achieved" : coreShare >= 0.4 ? "developing" : "not-yet",
      evidence: `${Math.round(coreShare * 100)}% of sublists 1–3 · ${awl.known} of ${awl.total} academic words in total`,
    },
    {
      id: "habit",
      statement: "I read regularly, on my own.",
      status: stats.textsCompleted >= 10 || stats.streak >= 5 ? "achieved" : stats.textsCompleted >= 3 ? "developing" : "not-yet",
      evidence: `${stats.textsCompleted} texts finished, ${stats.streak}-day streak`,
    },
  ];

  return {
    skills,
    weakest,
    guess: { correct: guessCorrect, total: guessTotal },
    grammar,
    grammarStage: stage,
    fluency: {
      runs: validRuns.map((r) => ({ day: dayKey(dayOf(r.createdAt)), value: Math.round(r.wpm), title: r.text.title })),
      best: bestFluency && Math.round(bestFluency),
    },
    topics: topics.size,
    ieltsBand,
    awl,
    canDo,
  };
}

export type LearningProfile = Awaited<ReturnType<typeof learningProfile>>;
