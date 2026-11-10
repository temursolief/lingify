import "server-only";
import { cache } from "react";
import { db } from "./db";
import { STUCK_TRIES } from "./insights";
import { addDays, dayKey, dayOf, streakFrom } from "./time";

export const teacherClass = cache((classId: string, teacherId: string) => db.class.findFirst({ where: { id: classId, teacherId } }));

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

export type Summary = { passagesDone: number; passagesStarted: number; band: number | null; cardsThisWeek: number; streak: number; stuck: number };

/**
 * The numbers shown for each student, for any number of students in four queries (not four per student): a class
 * page with 30 students used to send 120.
 */
export async function studentSummaries(userIds: string[]): Promise<Map<string, Summary>> {
  const result = new Map<string, Summary>();
  if (!userIds.length) return result;
  const today = dayOf(new Date());
  const weekAgo = addDays(new Date(), -7);
  const users = { in: userIds };
  const stuckAnswer = { correct: false, tries: { gte: STUCK_TRIES } };
  const [attempts, cards, days, stuck] = await Promise.all([
    db.passageAttempt.findMany({ where: { userId: users, firstSubmittedAt: { not: null } }, orderBy: { firstSubmittedAt: "desc" }, select: { userId: true, band: true, completedAt: true } }),
    db.reviewLog.groupBy({ by: ["userId"], where: { userId: users, at: { gte: weekAgo } }, _count: true }),
    db.activityTime.findMany({ where: { userId: users, seconds: { gte: 60 } }, select: { userId: true, day: true } }),
    db.passageAttempt.findMany({
      where: { userId: users, completedAt: null, answers: { some: stuckAnswer } },
      select: { userId: true, _count: { select: { answers: { where: stuckAnswer } } } },
    }),
  ]);
  for (const id of userIds) {
    const mine = attempts.filter((a) => a.userId === id);
    result.set(id, {
      passagesDone: mine.filter((a) => a.completedAt).length,
      passagesStarted: mine.length,
      band: avgBand(mine.slice(0, 3).flatMap((a) => (a.band === null ? [] : [a.band]))),
      cardsThisWeek: cards.find((c) => c.userId === id)?._count ?? 0,
      streak: streakFrom(new Set(days.filter((d) => d.userId === id).map((d) => dayKey(d.day))), today),
      stuck: stuck.filter((a) => a.userId === id).reduce((n, a) => n + a._count.answers, 0),
    });
  }
  return result;
}

/** One student's numbers. Cached for the request: the sidebar and the page ask for the same thing. */
export const studentSummary = cache(async (userId: string): Promise<Summary> => (await studentSummaries([userId])).get(userId)!);

export async function classOverview(classId: string): Promise<StudentRow[]> {
  const enrollments = await db.enrollment.findMany({
    where: { classId },
    select: { user: { select: { id: true, name: true, email: true, lastActiveAt: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const summaries = await studentSummaries(enrollments.map((e) => e.user.id));
  return enrollments.map(({ user }) => ({ ...user, ...summaries.get(user.id)! }));
}

/** Per class: how many students were active in the last days, and how many are stuck on a question. Two queries. */
export async function classActivity(classIds: string[], days = 7): Promise<Map<string, { active: number; stuck: number }>> {
  const result = new Map(classIds.map((id) => [id, { active: 0, stuck: 0 }]));
  if (!classIds.length) return result;
  const since = addDays(new Date(), -days);
  const inClasses = { classId: { in: classIds } };
  const [active, stuck] = await Promise.all([
    db.enrollment.groupBy({ by: ["classId"], where: { ...inClasses, user: { lastActiveAt: { gte: since } } }, _count: true }),
    db.enrollment.findMany({
      where: { ...inClasses, user: { attempts: { some: { completedAt: null, answers: { some: { correct: false, tries: { gte: STUCK_TRIES } } } } } } },
      select: { classId: true },
    }),
  ]);
  for (const a of active) result.get(a.classId)!.active = a._count;
  for (const s of stuck) result.get(s.classId)!.stuck++;
  return result;
}
