import "server-only";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { dayFromJson, utc } from "./sql";
import { reviewHealthColumns, reviewHealthOf, STUCK_TRIES, type ReviewHealth } from "./insights";
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

type SummaryRow = { done: number; started: number; bands: (number | null)[]; cards: number; days: string[]; stuck: number };

/**
 * The SQL columns behind a Summary, for the user whose id is `user` in the surrounding query: passages finished and
 * started, the last three first-try bands, cards this week, the days with a minute or more of study (for the streak)
 * and red answers stuck after three tries. Shared by the student pages and the class overview.
 */
function summaryColumns(user: Prisma.Sql, weekAgo: Date) {
  return Prisma.sql`
      (SELECT count(*) FROM "PassageAttempt" a WHERE a."userId" = ${user} AND a."invalidatedAt" IS NULL AND a."firstSubmittedAt" IS NOT NULL AND a."completedAt" IS NOT NULL)::int AS done,
      (SELECT count(*) FROM "PassageAttempt" a WHERE a."userId" = ${user} AND a."invalidatedAt" IS NULL AND a."firstSubmittedAt" IS NOT NULL)::int AS started,
      (SELECT coalesce(json_agg(b.band), '[]') FROM (
        SELECT a.band FROM "PassageAttempt" a WHERE a."userId" = ${user} AND a."invalidatedAt" IS NULL AND a."firstSubmittedAt" IS NOT NULL
        ORDER BY a."firstSubmittedAt" DESC LIMIT 3) b) AS bands,
      (SELECT count(*) FROM "ReviewLog" r WHERE r."userId" = ${user} AND r.at >= ${utc(weekAgo)})::int AS cards,
      (SELECT coalesce(json_agg(DISTINCT t.day), '[]') FROM "ActivityTime" t WHERE t."userId" = ${user} AND t.seconds >= 60) AS days,
      (SELECT count(*) FROM "QuestionAnswer" q JOIN "PassageAttempt" a ON a.id = q."attemptId"
        WHERE a."userId" = ${user} AND a."invalidatedAt" IS NULL AND a."completedAt" IS NULL AND q.correct = false AND q.tries >= ${STUCK_TRIES})::int AS stuck`;
}

function summaryOf(r: SummaryRow | undefined, today: Date): Summary {
  return {
    passagesDone: r?.done ?? 0,
    passagesStarted: r?.started ?? 0,
    band: avgBand((r?.bands ?? []).filter((b): b is number => b !== null)),
    cardsThisWeek: r?.cards ?? 0,
    streak: streakFrom(new Set((r?.days ?? []).map((d) => dayKey(dayFromJson(d)))), today),
    stuck: r?.stuck ?? 0,
  };
}

/**
 * The numbers shown for each student, for any number of students in one SQL statement (a class page with 30 students
 * once sent 120 queries; then four; now one).
 */
export async function studentSummaries(userIds: string[]): Promise<Map<string, Summary>> {
  const result = new Map<string, Summary>();
  if (!userIds.length) return result;
  const today = dayOf(new Date());
  const rows = await db.$queryRaw<(SummaryRow & { id: string })[]>`
    SELECT u.id, ${summaryColumns(Prisma.sql`u.id`, addDays(new Date(), -7))}
    FROM "User" u WHERE u.id IN (${Prisma.join(userIds)})`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of userIds) result.set(id, summaryOf(byId.get(id), today));
  return result;
}

/** One student's numbers. Cached for the request: the sidebar and the page ask for the same thing. */
export const studentSummary = cache(async (userId: string): Promise<Summary> => (await studentSummaries([userId])).get(userId)!);

/**
 * The class list for the teacher: each student's numbers, how many first tries were flagged, and flashcard speed
 * over the last week. One SQL statement for the whole class (it was about eight queries, some waiting on others).
 */
export async function classOverview(classId: string): Promise<StudentRow[]> {
  const today = dayOf(new Date());
  const now = new Date();
  const rows = await db.$queryRaw<
    (SummaryRow & { id: string; name: string; email: string; lastActiveAt: Date | null; flagged: number; reviews: number; timed: number; medianMs: number | null; under: number; newTimed: number; newEasyFast: number })[]
  >`
    SELECT u.id, u.name, u.email, u."lastActiveAt",
      ${summaryColumns(Prisma.sql`u.id`, addDays(now, -7))},
      ((SELECT count(*) FROM "PassageAttempt" a WHERE a."userId" = u.id AND a."invalidatedAt" IS NULL AND a."integrityFlagged")
        + (SELECT count(*) FROM "ListeningAttempt" a WHERE a."userId" = u.id AND a."invalidatedAt" IS NULL AND a."integrityFlagged"))::int AS flagged,
      rh.reviews, rh.timed, rh."medianMs", rh.under, rh."newTimed", rh."newEasyFast"
    FROM "Enrollment" e
    JOIN "User" u ON u.id = e."userId"
    LEFT JOIN LATERAL (${reviewHealthColumns(Prisma.sql`u.id`, addDays(now, -7))}) rh ON true
    WHERE e."classId" = ${classId} AND e.status = 'APPROVED'
    ORDER BY u.name ASC`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    lastActiveAt: r.lastActiveAt,
    ...summaryOf(r, today),
    flagged: r.flagged,
    review: r.reviews ? reviewHealthOf(r) : null,
  }));
}

