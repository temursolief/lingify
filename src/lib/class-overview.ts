import "server-only";
import { db } from "./db";
import { flagsFor, type Flag } from "./flags";
import { studentStats } from "./stats";

export type StudentRow = {
  id: string;
  name: string;
  email: string;
  lastActiveAt: Date | null;
  weekMinutes: number;
  weekMinutesByActivity: { reading: number; quiz: number; vocab: number; grammar: number; review: number };
  totalMinutes: number;
  weekWords: number;
  totalWords: number;
  textsCompleted: number;
  knownCount: number;
  knownGrowth30: number;
  learningCount: number;
  comprehension: number | null;
  avgWpm: number | null;
  streak: number;
  flags: Flag[];
};

export async function teacherClass(classId: string, teacherId: string) {
  return db.class.findFirst({ where: { id: classId, teacherId } });
}

export async function classOverview(classId: string): Promise<StudentRow[]> {
  const enrollments = await db.enrollment.findMany({
    where: { classId },
    include: { user: { select: { id: true, name: true, email: true, lastActiveAt: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return Promise.all(
    enrollments.map(async ({ user }) => {
      const [stats, flags] = await Promise.all([studentStats(user.id), flagsFor(user.id)]);
      const recentScores = stats.comprehensionTrend.slice(-5);
      const recentWpm = stats.wpmTrend.slice(-5);
      const m = (s: number) => Math.round(s / 60);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        lastActiveAt: user.lastActiveAt,
        weekMinutes: m(stats.weekSeconds),
        weekMinutesByActivity: {
          reading: m(stats.weekByActivity.READING),
          quiz: m(stats.weekByActivity.QUIZ),
          vocab: m(stats.weekByActivity.VOCAB),
          grammar: m(stats.weekByActivity.GRAMMAR),
          review: m(stats.weekByActivity.REVIEW),
        },
        totalMinutes: m(stats.totalSeconds),
        weekWords: stats.weekWordsRead,
        totalWords: stats.wordsRead,
        textsCompleted: stats.textsCompleted,
        knownCount: stats.knownCount,
        knownGrowth30: stats.knownCount - (stats.vocabGrowth[0]?.known ?? stats.knownCount),
        learningCount: stats.learningCount,
        comprehension: recentScores.length ? Math.round(recentScores.reduce((n, s) => n + s.value, 0) / recentScores.length) : null,
        avgWpm: recentWpm.length ? Math.round(recentWpm.reduce((n, s) => n + s.value, 0) / recentWpm.length) : null,
        streak: stats.streak,
        flags,
      };
    }),
  );
}

export async function activeStudentCounts(classIds: string[], days = 7) {
  const since = new Date(Date.now() - days * 86_400_000);
  return Promise.all(classIds.map((classId) => db.enrollment.count({ where: { classId, user: { lastActiveAt: { gte: since } } } })));
}
