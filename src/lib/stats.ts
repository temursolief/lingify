import "server-only";
import type { Activity, GoalType } from "@/generated/prisma/client";
import { db } from "./db";
import { addDays, dayKey, dayOf, streakFrom, weekStart } from "./time";

export const ACTIVITIES: Activity[] = ["READING", "QUIZ", "VOCAB", "GRAMMAR", "REVIEW", "PLACEMENT"];
export const ACTIVITY_LABEL: Record<Activity, string> = {
  READING: "Reading",
  QUIZ: "Comprehension",
  VOCAB: "Vocabulary practice",
  GRAMMAR: "Grammar in context",
  REVIEW: "Word review",
  PLACEMENT: "Placement test",
};

export type GoalProgress = { id: string; type: GoalType; target: number; current: number; fromTeacher: boolean; note?: string | null };

const MIN_ACTIVE_SECONDS = 60;

export async function studentStats(userId: string, days = 30) {
  const now = new Date();
  const today = dayOf(now);
  const since = addDays(today, -(days - 1));
  const thisWeek = weekStart(today);

  const [times, sessions, snapshots, attempts, knownCount, learningCount, newKnownThisWeek, dueCount] = await Promise.all([
    db.activityTime.findMany({ where: { userId }, orderBy: { day: "asc" } }),
    db.readingSession.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: "asc" },
      select: { completedAt: true, wpm: true, quizScore: true, activeSeconds: true, text: { select: { title: true, wordCount: true, slug: true } } },
    }),
    db.vocabSnapshot.findMany({ where: { userId, day: { gte: since } }, orderBy: { day: "asc" } }),
    db.exerciseAttempt.groupBy({ by: ["kind", "correct"], where: { userId }, _count: true }),
    db.lemmaState.count({ where: { userId, status: "KNOWN" } }),
    db.lemmaState.count({ where: { userId, status: "LEARNING" } }),
    db.lemmaState.count({ where: { userId, status: "KNOWN", source: { not: "PLACEMENT" }, knownAt: { gte: thisWeek } } }),
    db.lemmaState.count({ where: { userId, status: "LEARNING", srsDue: { lte: now } } }),
  ]);

  const totalByActivity = Object.fromEntries(ACTIVITIES.map((a) => [a, 0])) as Record<Activity, number>;
  const weekByActivity = Object.fromEntries(ACTIVITIES.map((a) => [a, 0])) as Record<Activity, number>;
  const perDay = new Map<string, Record<Activity, number>>();
  const activeDays = new Set<string>();
  const secondsPerDay = new Map<string, number>();

  for (const t of times) {
    totalByActivity[t.activity] += t.seconds;
    if (t.day >= thisWeek) weekByActivity[t.activity] += t.seconds;
    const key = dayKey(t.day);
    if (t.activity !== "PLACEMENT") secondsPerDay.set(key, (secondsPerDay.get(key) ?? 0) + t.seconds);
    if (t.day >= since) {
      const row = perDay.get(key) ?? (Object.fromEntries(ACTIVITIES.map((a) => [a, 0])) as Record<Activity, number>);
      row[t.activity] += t.seconds;
      perDay.set(key, row);
    }
  }
  for (const [key, seconds] of secondsPerDay) if (seconds >= MIN_ACTIVE_SECONDS) activeDays.add(key);
  for (const s of sessions) if (s.completedAt) activeDays.add(dayKey(dayOf(s.completedAt)));

  const daily = Array.from({ length: days }, (_, i) => {
    const key = dayKey(addDays(since, i));
    return { day: key, ...(perDay.get(key) ?? (Object.fromEntries(ACTIVITIES.map((a) => [a, 0])) as Record<Activity, number>)) };
  });

  const weekSessions = sessions.filter((s) => s.completedAt && s.completedAt >= thisWeek);
  const accuracy = (kind: string) => {
    const rows = attempts.filter((a) => a.kind === kind);
    const total = rows.reduce((n, r) => n + r._count, 0);
    const correct = rows.filter((r) => r.correct).reduce((n, r) => n + r._count, 0);
    return total ? correct / total : null;
  };

  // Fill vocabulary growth forward so the chart has a value for every day.
  const snapByDay = new Map(snapshots.map((s) => [dayKey(s.day), s.knownCount]));
  let last = snapshots[0]?.knownCount ?? knownCount;
  const vocabGrowth = Array.from({ length: days }, (_, i) => {
    const key = dayKey(addDays(since, i));
    last = snapByDay.get(key) ?? last;
    return { day: key, known: last };
  });
  if (vocabGrowth.length) vocabGrowth[vocabGrowth.length - 1].known = knownCount;

  return {
    totalSeconds: Object.values(totalByActivity).reduce((a, b) => a + b, 0),
    weekSeconds: Object.values(weekByActivity).reduce((a, b) => a + b, 0),
    totalByActivity,
    weekByActivity,
    daily,
    streak: streakFrom(activeDays, today),
    textsCompleted: sessions.length,
    wordsRead: sessions.reduce((n, s) => n + s.text.wordCount, 0),
    weekWordsRead: weekSessions.reduce((n, s) => n + s.text.wordCount, 0),
    weekTexts: weekSessions.length,
    knownCount,
    learningCount,
    newKnownThisWeek,
    dueCount,
    wpmTrend: sessions.filter((s) => s.wpm).map((s) => ({ day: dayKey(dayOf(s.completedAt!)), value: Math.round(s.wpm!), title: s.text.title })),
    comprehensionTrend: sessions
      .filter((s) => s.quizScore !== null)
      .map((s) => ({ day: dayKey(dayOf(s.completedAt!)), value: Math.round(s.quizScore! * 100), title: s.text.title })),
    accuracy: {
      comprehension: accuracy("COMPREHENSION"),
      vocab: accuracy("VOCAB"),
      grammar: accuracy("GRAMMAR"),
      review: accuracy("REVIEW"),
    },
    recentSessions: sessions.slice(-8).reverse(),
    vocabGrowth,
  };
}

export type StudentStats = Awaited<ReturnType<typeof studentStats>>;

export async function goalProgress(userId: string): Promise<GoalProgress[]> {
  const thisWeek = weekStart(dayOf(new Date()));
  const [goals, assigned, sessions, minutes] = await Promise.all([
    db.goal.findMany({ where: { userId, active: true }, orderBy: { createdAt: "asc" } }),
    db.assignmentRecipient.findMany({
      where: { studentId: userId, assignment: { kind: "GOAL" } },
      select: { assignment: { select: { id: true, goalType: true, target: true, note: true } } },
    }),
    db.readingSession.findMany({
      where: { userId, completedAt: { gte: thisWeek } },
      select: { text: { select: { wordCount: true } } },
    }),
    db.activityTime.aggregate({ where: { userId, day: { gte: thisWeek } }, _sum: { seconds: true } }),
  ]);

  const current = (type: GoalType) =>
    type === "WORDS_WEEK"
      ? sessions.reduce((n, s) => n + s.text.wordCount, 0)
      : type === "TEXTS_WEEK"
        ? sessions.length
        : Math.round((minutes._sum.seconds ?? 0) / 60);

  return [
    ...assigned
      .filter((a) => a.assignment.goalType && a.assignment.target)
      .map((a) => ({
        id: a.assignment.id,
        type: a.assignment.goalType!,
        target: a.assignment.target!,
        current: current(a.assignment.goalType!),
        fromTeacher: true,
        note: a.assignment.note,
      })),
    ...goals.map((g) => ({ id: g.id, type: g.type, target: g.target, current: current(g.type), fromTeacher: false })),
  ];
}

export const GOAL_LABEL: Record<GoalType, string> = {
  WORDS_WEEK: "words read this week",
  TEXTS_WEEK: "texts finished this week",
  MINUTES_WEEK: "minutes of practice this week",
};
