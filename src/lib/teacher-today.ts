import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { ms, utc } from "./sql";
import { STUCK_TRIES } from "./insights";
import { addDays, formatDay } from "./time";

/** Days without opening Lingify, with homework open, before a student shows up on the teacher's list. */
const INACTIVE_DAYS = 5;
/** How long a flagged first try stays on the list (a retake removes it sooner). */
const FLAG_DAYS = 14;

export type Attention = {
  id: string;
  tone: "bad" | "warn" | "accent" | "muted";
  title: string;
  meta: string;
  href: string;
  /** the one-click fix offered beside "Open" */
  action: { kind: "retake"; attemptKind: "passage" | "lesson"; attemptId: string; name: string } | { kind: "nudge"; studentId: string; name: string; linked: boolean } | { kind: "link"; label: string; href: string };
};

export type DueSoon = { id: string; classId: string; className: string; title: string; kind: "reading" | "listening"; dueAt: Date | null; done: number; total: number };

const ago = (d: Date | null) => {
  if (!d) return "never opened Lingify";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

/**
 * The count beside "Today" in the sidebar. It is on every teacher page, and working it out takes about thirty
 * queries (stuck students, flagged tries, class heatmaps), which on a small connection pool queue up in front of the
 * page's own query: every teacher page felt slow, the Listening page most, since it has almost nothing else to do.
 * So it is worked out at most once a minute per teacher; the Today page itself always reads fresh.
 */
export async function teacherBadge(teacherId: string): Promise<number> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  cacheTag(`teacher-badge:${teacherId}`);
  return (await teacherToday(teacherId)).items.length;
}

type Member = { classId: string; className: string; userId: string | null; name: string | null; lastActiveAt: number | null; linked: boolean; open: number };
type Stuck = { userId: string; name: string; passageId: string; title: string; questions: number[] };
type Flagged = { kind: "passage" | "lesson"; id: string; userId: string; band: number | null; seconds: number | null; reasons: string[]; name: string; title: string };
type Due = { id: string; classId: string; className: string; title: string; passageId: string | null; dueAt: number | null; done: number; total: number };
type Magnet = { classId: string; passageId: string; title: string; number: number; answer: string; count: number };
type Today = { members: Member[]; stuck: Stuck[]; flagged: Flagged[]; due: Due[]; magnets: Magnet[]; submitted: { classId: string; submitted: number }[] };


/**
 * Everything the Today page needs, in one SQL statement: one round trip to the database however many classes the
 * teacher has (it used to be about thirty queries, several waiting on each other, and a full heatmap per class read
 * every answer's history only to find its most common wrong answer). The database does the joining and counting;
 * each part comes back as a JSON array.
 */
async function todayRows(teacherId: string, flagSince: Date, dueFrom: Date): Promise<Today> {
  const [row] = await db.$queryRaw<Today[]>`
    WITH students AS (
      SELECT DISTINCT e."userId" FROM "Enrollment" e JOIN "Class" c ON c.id = e."classId" WHERE c."teacherId" = ${teacherId}
    ),
    latest AS (
      -- the passage each class was given most recently
      SELECT DISTINCT ON (a."classId") a."classId", a."passageId", p.title
      FROM "Assignment" a JOIN "Class" c ON c.id = a."classId" JOIN "Passage" p ON p.id = a."passageId"
      WHERE c."teacherId" = ${teacherId} AND a."passageId" IS NOT NULL
      ORDER BY a."classId", a."createdAt" DESC
    ),
    att AS (
      -- each student's latest counted attempt at it
      SELECT DISTINCT ON (l."classId", pa."userId") l."classId", l."passageId", l.title, pa.id, pa."firstSubmittedAt"
      FROM latest l
      JOIN "Enrollment" e ON e."classId" = l."classId"
      JOIN "PassageAttempt" pa ON pa."userId" = e."userId" AND pa."passageId" = l."passageId" AND pa."invalidatedAt" IS NULL
      ORDER BY l."classId", pa."userId", pa."startedAt" DESC
    )
    SELECT
      (SELECT coalesce(json_agg(m ORDER BY m."classCreated" DESC, m.name), '[]') FROM (
        SELECT c.id AS "classId", c.name AS "className", c."createdAt" AS "classCreated", u.id AS "userId", u.name,
               ${ms(Prisma.sql`u."lastActiveAt"`)} AS "lastActiveAt", (u."telegramChatId" IS NOT NULL) AS linked,
               (SELECT count(*) FROM "AssignmentRecipient" r JOIN "Assignment" a ON a.id = r."assignmentId" JOIN "Class" c2 ON c2.id = a."classId"
                 WHERE r."studentId" = u.id AND r."completedAt" IS NULL AND c2."teacherId" = ${teacherId})::int AS "open"
        FROM "Class" c LEFT JOIN "Enrollment" e ON e."classId" = c.id LEFT JOIN "User" u ON u.id = e."userId"
        WHERE c."teacherId" = ${teacherId}
      ) m) AS members,
      (SELECT coalesce(json_agg(s ORDER BY s.name, s.title), '[]') FROM (
        SELECT a."userId", u.name, a."passageId", p.title, array_agg(qa.number ORDER BY qa.number) AS questions
        FROM "QuestionAnswer" qa
        JOIN "PassageAttempt" a ON a.id = qa."attemptId"
        JOIN "User" u ON u.id = a."userId"
        JOIN "Passage" p ON p.id = a."passageId"
        WHERE qa.correct = false AND qa.tries >= ${STUCK_TRIES} AND a."invalidatedAt" IS NULL AND a."completedAt" IS NULL
          AND a."userId" IN (SELECT "userId" FROM students)
        GROUP BY a."userId", u.name, a."passageId", p.title
      ) s) AS stuck,
      (SELECT coalesce(json_agg(f ORDER BY f.kind DESC, f.at DESC), '[]') FROM (
        SELECT 'passage' AS kind, a.id, a."userId", a.band, a."firstSeconds" AS seconds, a."integrityReasons" AS reasons, u.name, p.title, a."firstSubmittedAt" AS at
        FROM "PassageAttempt" a JOIN "User" u ON u.id = a."userId" JOIN "Passage" p ON p.id = a."passageId"
        WHERE a."integrityFlagged" AND a."invalidatedAt" IS NULL AND a."firstSubmittedAt" >= ${utc(flagSince)} AND a."userId" IN (SELECT "userId" FROM students)
        UNION ALL
        SELECT 'lesson', a.id, a."userId", a.band, NULL, a."integrityReasons", u.name, l.title, a."firstSubmittedAt"
        FROM "ListeningAttempt" a JOIN "User" u ON u.id = a."userId" JOIN "ListeningLesson" l ON l.id = a."lessonId"
        WHERE a."integrityFlagged" AND a."invalidatedAt" IS NULL AND a."firstSubmittedAt" >= ${utc(flagSince)} AND a."userId" IN (SELECT "userId" FROM students)
      ) f) AS flagged,
      (SELECT coalesce(json_agg(d), '[]') FROM (
        SELECT a.id, a."classId", c.name AS "className", coalesce(p.title, l.title) AS title, a."passageId", ${ms(Prisma.sql`a."dueAt"`)} AS "dueAt",
               (SELECT count(*) FROM "AssignmentRecipient" r WHERE r."assignmentId" = a.id AND r."completedAt" IS NOT NULL)::int AS done,
               (SELECT count(*) FROM "AssignmentRecipient" r WHERE r."assignmentId" = a.id)::int AS total
        FROM "Assignment" a JOIN "Class" c ON c.id = a."classId"
        LEFT JOIN "Passage" p ON p.id = a."passageId" LEFT JOIN "ListeningLesson" l ON l.id = a."lessonId"
        WHERE c."teacherId" = ${teacherId}
          AND (a."dueAt" IS NULL OR a."dueAt" >= ${utc(dueFrom)})
          AND ((p.id IS NOT NULL AND p."archivedAt" IS NULL) OR (l.id IS NOT NULL AND l."archivedAt" IS NULL))
        ORDER BY a."dueAt" ASC NULLS LAST, a."createdAt" DESC
        LIMIT 6
      ) d) AS due,
      (SELECT coalesce(json_agg(g), '[]') FROM (
        -- wrong first answers on the latest passage, counted per question and answer (blanks are not a "choice")
        SELECT att."classId", att."passageId", att.title, qa.number, upper(btrim(qa.history->0->>'answer')) AS answer, count(*)::int AS count
        FROM att JOIN "QuestionAnswer" qa ON qa."attemptId" = att.id
        WHERE att."firstSubmittedAt" IS NOT NULL AND qa."firstCorrect" = false AND btrim(coalesce(qa.history->0->>'answer', '')) <> ''
        GROUP BY 1, 2, 3, 4, 5
      ) g) AS magnets,
      (SELECT coalesce(json_agg(k), '[]') FROM (
        SELECT "classId", count(*)::int AS submitted FROM att WHERE "firstSubmittedAt" IS NOT NULL GROUP BY 1
      ) k) AS submitted`;
  return row!;
}

/**
 * What needs this teacher today, worst first: students stuck on a question, flagged first tries, questions that
 * tricked most of a class, and students who have gone quiet with homework open. Plus homework coming due.
 */
export const teacherToday = cache(async (teacherId: string) => {
  const now = new Date();
  const quietSince = addDays(now, -INACTIVE_DAYS).getTime();
  const { members, stuck, flagged, due, magnets: wrong, submitted } = await todayRows(teacherId, addDays(now, -FLAG_DAYS), addDays(now, -2));

  const classes = [...new Map(members.map((m) => [m.classId, m.className])).entries()];
  const className = new Map(classes);
  const students = new Map<string, Member>();
  const classOf = new Map<string, string>();
  for (const m of members) {
    if (!m.userId) continue;
    students.set(m.userId, m);
    classOf.set(m.userId, m.classId);
  }
  const quiet = [...students.values()].filter((u) => u.open > 0 && (u.lastActiveAt === null || u.lastActiveAt < quietSince));

  // A class's mistake magnet: the wrong answer most of it chose on one question, if that is half the class or more.
  const submittedIn = new Map(submitted.map((s) => [s.classId, s.submitted]));
  const best = new Map<string, Magnet>();
  for (const w of wrong) {
    const b = best.get(w.classId);
    if (!b || w.count > b.count || (w.count === b.count && (w.number < b.number || (w.number === b.number && w.answer < b.answer)))) best.set(w.classId, w);
  }
  const magnets = classes
    .map(([classId]) => {
      const m = best.get(classId);
      const n = submittedIn.get(classId) ?? 0;
      return m && n >= 3 && m.count / n >= 0.5 ? { ...m, submitted: n } : null;
    })
    .filter((m) => m !== null);

  const student = (id: string) => `/teacher/classes/${classOf.get(id)}/students/${id}`;
  const items: Attention[] = [
    ...stuck.map(
      (s): Attention => ({
        id: `stuck:${s.userId}:${s.passageId}`,
        tone: "bad",
        title: `${s.name} is stuck on ${s.questions.length > 1 ? "questions" : "question"} ${s.questions.join(", ")} of “${s.title}”`,
        meta: "Three or more wrong tries and still red",
        href: student(s.userId),
        action: { kind: "nudge", studentId: s.userId, name: s.name, linked: !!students.get(s.userId)?.linked },
      }),
    ),
    ...flagged.map(
      (a): Attention => ({
        id: `flag:${a.id}`,
        tone: "bad",
        title: `${a.name}'s first try at “${a.title}” was flagged`,
        meta: [a.band !== null && `Band ${a.band}`, a.seconds && `${Math.round(a.seconds / 60)} min`, a.reasons.length && a.reasons.map(reasonLabel).join(", ")].filter(Boolean).join(" · "),
        href: student(a.userId),
        action: { kind: "retake", attemptKind: a.kind, attemptId: a.id, name: a.name },
      }),
    ),
    ...magnets.map(
      (m): Attention => ({
        id: `magnet:${m.classId}:${m.number}`,
        tone: "warn",
        title: `${m.count} of ${m.submitted} chose ${m.answer} on Q${m.number}`,
        meta: `“${m.title}” · ${className.get(m.classId)}. Worth five minutes in class`,
        href: `/teacher/classes/${m.classId}?tab=passages&p=${m.passageId}`,
        action: { kind: "link", label: "See insights", href: `/teacher/classes/${m.classId}?tab=passages&p=${m.passageId}` },
      }),
    ),
    ...quiet.map(
      (u): Attention => ({
        id: `quiet:${u.userId}`,
        tone: "muted",
        title: `${u.name} has been quiet`,
        meta: `Last active ${ago(u.lastActiveAt === null ? null : new Date(u.lastActiveAt))} · ${u.open} homework open`,
        href: student(u.userId!),
        action: { kind: "nudge", studentId: u.userId!, name: u.name!, linked: u.linked },
      }),
    ),
  ];

  const dueSoon: DueSoon[] = due.map((a) => ({
    id: a.id,
    classId: a.classId,
    className: a.className,
    title: a.title,
    kind: a.passageId ? "reading" : "listening",
    dueAt: a.dueAt === null ? null : new Date(a.dueAt),
    done: a.done,
    total: a.total,
  }));

  return { items, dueSoon, classes: classes.length, students: students.size };
});

const REASONS: Record<string, string> = {
  UNREALISTIC_SPEED_HIGH_SCORE: "high score, very fast",
  ANSWER_KEY_SUSPECTED: "answer key suspected",
  LOCATING_SKILL_MISMATCH: "proofs in the wrong place",
  TAB_HIDDEN: "left the test",
  WINDOW_BLUR: "left the window",
  FULLSCREEN_EXIT: "left full screen",
};

function reasonLabel(r: string) {
  return REASONS[r] ?? r.toLowerCase().replaceAll("_", " ");
}

export const dueLabel = (d: Date | null) => (d ? formatDay(d, true) : "no due date");
