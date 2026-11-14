import "server-only";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { dayFromJson, utc } from "./sql";
import { reviewHealth, STUCK_TRIES, type ReviewHealth } from "./insights";
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
  /** first tries flagged (auto-finished, answer key, pace, locating mismatch) that still count */
  flagged: number;
  /** flashcard study speed over the last 7 days */
  review: ReviewHealth | null;
};

const avgBand = (bands: number[]) => (bands.length ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 2) / 2 : null);

export type Summary = { passagesDone: number; passagesStarted: number; band: number | null; cardsThisWeek: number; streak: number; stuck: number };

/**
 * The numbers shown for each student, for any number of students in one SQL statement (a class page with 30 students
 * once sent 120 queries; then four; now one): passages finished and started, the last three first-try bands, cards
 * this week, the days with a minute or more of study (for the streak) and red answers stuck after three tries.
 */
export async function studentSummaries(userIds: string[]): Promise<Map<string, Summary>> {
  const result = new Map<string, Summary>();
  if (!userIds.length) return result;
  const today = dayOf(new Date());
  const weekAgo = addDays(new Date(), -7);
  const rows = await db.$queryRaw<{ id: string; done: number; started: number; bands: (number | null)[]; cards: number; days: string[]; stuck: number }[]>`
    SELECT u.id,
      (SELECT count(*) FROM "PassageAttempt" a WHERE a."userId" = u.id AND a."invalidatedAt" IS NULL AND a."firstSubmittedAt" IS NOT NULL AND a."completedAt" IS NOT NULL)::int AS done,
      (SELECT count(*) FROM "PassageAttempt" a WHERE a."userId" = u.id AND a."invalidatedAt" IS NULL AND a."firstSubmittedAt" IS NOT NULL)::int AS started,
      (SELECT coalesce(json_agg(b.band), '[]') FROM (
        SELECT a.band FROM "PassageAttempt" a WHERE a."userId" = u.id AND a."invalidatedAt" IS NULL AND a."firstSubmittedAt" IS NOT NULL
        ORDER BY a."firstSubmittedAt" DESC LIMIT 3) b) AS bands,
      (SELECT count(*) FROM "ReviewLog" r WHERE r."userId" = u.id AND r.at >= ${utc(weekAgo)})::int AS cards,
      (SELECT coalesce(json_agg(DISTINCT t.day), '[]') FROM "ActivityTime" t WHERE t."userId" = u.id AND t.seconds >= 60) AS days,
      (SELECT count(*) FROM "QuestionAnswer" q JOIN "PassageAttempt" a ON a.id = q."attemptId"
        WHERE a."userId" = u.id AND a."invalidatedAt" IS NULL AND a."completedAt" IS NULL AND q.correct = false AND q.tries >= ${STUCK_TRIES})::int AS stuck
    FROM "User" u WHERE u.id IN (${Prisma.join(userIds)})`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of userIds) {
    const r = byId.get(id);
    result.set(id, {
      passagesDone: r?.done ?? 0,
      passagesStarted: r?.started ?? 0,
      band: avgBand((r?.bands ?? []).filter((b): b is number => b !== null)),
      cardsThisWeek: r?.cards ?? 0,
      streak: streakFrom(new Set((r?.days ?? []).map((d) => dayKey(dayFromJson(d)))), today),
      stuck: r?.stuck ?? 0,
    });
  }
  return result;
}

/** One student's numbers. Cached for the request: the sidebar and the page ask for the same thing. */
export const studentSummary = cache(async (userId: string): Promise<Summary> => (await studentSummaries([userId])).get(userId)!);

/** The class list for the teacher: each student's numbers, plus how many first tries were flagged and flashcard speed. */
export async function classOverview(classId: string): Promise<StudentRow[]> {
  const enrollments = await db.enrollment.findMany({
    where: { classId },
    select: { user: { select: { id: true, name: true, email: true, lastActiveAt: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const ids = enrollments.map((e) => e.user.id);
  const flaggedWhere = { userId: { in: ids }, invalidatedAt: null, integrityFlagged: true };
  const [summaries, flaggedPassages, flaggedLessons, health] = await Promise.all([
    studentSummaries(ids),
    db.passageAttempt.groupBy({ by: ["userId"], where: flaggedWhere, _count: true }),
    db.listeningAttempt.groupBy({ by: ["userId"], where: flaggedWhere, _count: true }),
    reviewHealth(ids),
  ]);
  const flagged = (id: string) =>
    (flaggedPassages.find((f) => f.userId === id)?._count ?? 0) + (flaggedLessons.find((f) => f.userId === id)?._count ?? 0);
  return enrollments.map(({ user }) => ({ ...user, ...summaries.get(user.id)!, flagged: flagged(user.id), review: health.get(user.id) ?? null }));
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
      where: { ...inClasses, user: { attempts: { some: { invalidatedAt: null, completedAt: null, answers: { some: { correct: false, tries: { gte: STUCK_TRIES } } } } } } },
      select: { classId: true },
    }),
  ]);
  for (const a of active) result.get(a.classId)!.active = a._count;
  for (const s of stuck) result.get(s.classId)!.stuck++;
  return result;
}
