import "server-only";
import { db } from "./db";
import { STUCK_TRIES } from "./insights";
import { addDays, dayKey, dayOf, streakFrom } from "./time";

export async function teacherClass(classId: string, teacherId: string) {
  return db.class.findFirst({ where: { id: classId, teacherId } });
}

export type StudentRow = {
  id: string;
  name: string;
  email: string;
  lastActiveAt: Date | null;
  passagesDone: number;
  /** average first-try band of the last three passages */
  band: number | null;
  cardsThisWeek: number;
  streak: number;
  stuck: number;
};

const avgBand = (bands: number[]) => (bands.length ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 2) / 2 : null);

export async function studentSummary(userId: string) {
  const today = dayOf(new Date());
  const weekAgo = addDays(new Date(), -7);
  const [attempts, cardsThisWeek, days, stuck] = await Promise.all([
    db.passageAttempt.findMany({ where: { userId, firstSubmittedAt: { not: null } }, orderBy: { firstSubmittedAt: "desc" }, select: { band: true, completedAt: true } }),
    db.reviewLog.count({ where: { userId, at: { gte: weekAgo } } }),
    db.activityTime.findMany({ where: { userId, seconds: { gte: 60 } }, select: { day: true } }),
    db.questionAnswer.count({ where: { correct: false, tries: { gte: STUCK_TRIES }, attempt: { userId, completedAt: null } } }),
  ]);
  return {
    passagesDone: attempts.filter((a) => a.completedAt).length,
    passagesStarted: attempts.length,
    band: avgBand(attempts.slice(0, 3).map((a) => a.band!).filter((b) => b !== null)),
    cardsThisWeek,
    streak: streakFrom(new Set(days.map((d) => dayKey(d.day))), today),
    stuck,
  };
}

export async function classOverview(classId: string): Promise<StudentRow[]> {
  const enrollments = await db.enrollment.findMany({
    where: { classId },
    include: { user: { select: { id: true, name: true, email: true, lastActiveAt: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return Promise.all(enrollments.map(async ({ user }) => ({ ...user, ...(await studentSummary(user.id)) })));
}

export async function activeStudentCounts(classIds: string[], days = 7) {
  const since = addDays(new Date(), -days);
  return Promise.all(classIds.map((classId) => db.user.count({ where: { enrollments: { some: { classId } }, lastActiveAt: { gte: since } } })));
}
