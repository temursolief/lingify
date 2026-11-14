import "server-only";
import { Prisma, type ErrorTag, type ProctoringPolicy } from "@/generated/prisma/client";
import { db } from "./db";
import { ms, utc } from "./sql";
import { GROUP_LABEL, paragraphLetter, type GroupType } from "./passage-format";
import { integrityBadge, isAutoFinish, isSpam, type AttemptTelemetry, type Badge, type IntegrityEvent } from "./telemetry";
import { addDays, endOfDay, startOfDay } from "./time";

/** Questions a student retried this many times and still has red are flagged to the teacher. */
export const STUCK_TRIES = 3;
/** A review card this many days apart counts as "known" (Anki's "mature" is 21 days, past Lingify's 20-day cap). */
const KNOWN_INTERVAL = 7;


type History = { answer: string; correct: boolean; evidence: { paragraph: number; text: string } | null; at: string }[];

export type ErrorBreakdown = {
  passages: number;
  mistakes: number;
  tags: Record<ErrorTag, number>;
  /** mistakes per question type, with the tag counts inside each and where the student looked when proving it */
  byType: { type: GroupType; label: string; mistakes: number; tags: Partial<Record<ErrorTag, number>>; wrongParagraph: number; rightParagraph: number }[];
  /** from "Prove it" highlights checked against the teacher's evidence paragraph */
  location: number;
  comprehension: number;
  /** the single biggest bottleneck, e.g. 65% of mistakes are distractors in Matching headings */
  headline: { share: number; tag: ErrorTag; type: GroupType; label: string } | null;
};

/** Root causes of first-attempt mistakes for one student or a group of students. */
export async function errorBreakdown(who: string[] | { classId: string }): Promise<ErrorBreakdown> {
  // The students: a list of ids, or everyone in a class (read by the database, so the page need not load them first).
  const users = Array.isArray(who)
    ? who.length
      ? Prisma.sql`${Prisma.join(who)}`
      : null
    : Prisma.sql`SELECT "userId" FROM "Enrollment" WHERE "classId" = ${who.classId}`;
  // The first-try misses and the number of passages tried, in one statement.
  const [{ rows, passages }] = users
    ? await db.$queryRaw<{ rows: { type: string; errorTag: ErrorTag | null; evidenceOk: boolean | null; correct: boolean }[]; passages: number }[]>`
        WITH att AS (SELECT id FROM "PassageAttempt" WHERE "userId" IN (${users}) AND "invalidatedAt" IS NULL AND "firstSubmittedAt" IS NOT NULL)
        SELECT (SELECT coalesce(json_agg(json_build_object('type', q.type, 'errorTag', q."errorTag", 'evidenceOk', q."evidenceOk", 'correct', q.correct)), '[]')
                FROM "QuestionAnswer" q WHERE q."attemptId" IN (SELECT id FROM att) AND q."firstCorrect" = false) AS rows,
               (SELECT count(*) FROM att)::int AS passages`
    : [{ rows: [], passages: 0 }];
  const tags: Record<ErrorTag, number> = { VOCAB: 0, DISTRACTOR: 0, LOGIC: 0, CARELESS: 0 };
  const byType = new Map<GroupType, { mistakes: number; tags: Partial<Record<ErrorTag, number>>; wrongParagraph: number; rightParagraph: number }>();
  let location = 0;
  let comprehension = 0;
  for (const r of rows) {
    const type = r.type as GroupType;
    const entry = byType.get(type) ?? { mistakes: 0, tags: {}, wrongParagraph: 0, rightParagraph: 0 };
    entry.mistakes++;
    if (r.errorTag) {
      tags[r.errorTag]++;
      entry.tags[r.errorTag] = (entry.tags[r.errorTag] ?? 0) + 1;
    }
    if (r.evidenceOk === false) {
      location++;
      entry.wrongParagraph++;
    } else if (r.evidenceOk === true) {
      comprehension++;
      entry.rightParagraph++;
    }
    byType.set(type, entry);
  }
  const tagged = Object.values(tags).reduce((a, b) => a + b, 0);
  let headline: ErrorBreakdown["headline"] = null;
  for (const [type, entry] of byType) {
    for (const [tag, n] of Object.entries(entry.tags) as [ErrorTag, number][]) {
      if (tagged && (!headline || n / tagged > headline.share)) headline = { share: n / tagged, tag, type, label: GROUP_LABEL[type] };
    }
  }
  return {
    passages,
    mistakes: rows.length,
    tags,
    byType: [...byType.entries()].map(([type, e]) => ({ type, label: GROUP_LABEL[type], ...e })).sort((a, b) => b.mistakes - a.mistakes),
    location,
    comprehension,
    headline,
  };
}

const telemetryOf = (t: Prisma.JsonValue) => (t ?? {}) as Partial<AttemptTelemetry>;
const eventsOf = (e: Prisma.JsonValue) => (Array.isArray(e) ? e : []) as IntegrityEvent[];

/** The teacher's badge for a stored attempt (passage or lesson). */
export function attemptBadge(
  kind: "reading" | "listening",
  a: { firstSubmittedAt: Date | null; submissionReason: string; integrityReasons: string[]; integrityEvents: Prisma.JsonValue; telemetry: Prisma.JsonValue; seconds: number | null },
): Badge {
  return integrityBadge({
    kind,
    submitted: !!a.firstSubmittedAt,
    reason: a.submissionReason,
    reasons: a.integrityReasons,
    events: eventsOf(a.integrityEvents),
    telemetry: telemetryOf(a.telemetry),
    seconds: a.seconds,
  });
}

export type HeatCell = {
  number: number;
  firstCorrect: boolean;
  correct: boolean;
  tries: number;
  errorTag: ErrorTag | null;
  firstAnswer: string;
  /** blank because the proctor finished the test before the student reached it */
  unansweredAuto: boolean;
  timeSec: number | null;
  /** 1-based place in the order of first answers, out of `answeredCount` */
  orderPos: number | null;
  evidenceParagraph: string | null;
  evidenceOk: boolean | null;
};

/**
 * First-attempt results of a class on one passage: who got which question right the first time, how long each took
 * and in what order, who is stuck, the attempt's integrity badge, and the "mistake magnets": the questions where
 * most of the class chose the same wrong answer. One query for the attempts with their answers.
 */
export async function passageHeatmap(classId: string, chosen: string | null) {
  // The class, the passage (the one asked for, or the class's latest assigned one) and each student's latest counted
  // attempt with its answers: one statement.
  const [data] = await db.$queryRaw<{ passageId: string | null; students: { id: string; name: string }[]; attempts: HeatAttemptJson[]; numbers: number[] }[]>`
    WITH pick AS (
      SELECT coalesce(${chosen}::text, (
        SELECT a."passageId" FROM "Assignment" a JOIN "Passage" p ON p.id = a."passageId"
        WHERE a."classId" = ${classId} AND p."archivedAt" IS NULL ORDER BY a."createdAt" DESC LIMIT 1)) AS id
    ),
    mem AS (SELECT u.id, u.name FROM "Enrollment" e JOIN "User" u ON u.id = e."userId" WHERE e."classId" = ${classId})
    SELECT (SELECT id FROM pick) AS "passageId",
      (SELECT coalesce(json_agg(json_build_object('id', id, 'name', name) ORDER BY name), '[]') FROM mem) AS students,
      (SELECT coalesce(json_agg(t), '[]') FROM (
        SELECT DISTINCT ON (a."userId") a.id, a."userId", ${ms(Prisma.sql`a."firstSubmittedAt"`)} AS "firstSubmittedAt", ${ms(Prisma.sql`a."completedAt"`)} AS "completedAt",
               a."firstCorrect", a.total, a.band, a."firstSeconds", a."submissionReason", a."integrityReasons", a."integrityEvents", a.telemetry,
               (SELECT coalesce(json_agg(json_build_object('number', q.number, 'type', q.type, 'firstCorrect', q."firstCorrect", 'correct', q.correct, 'tries', q.tries,
                         'errorTag', q."errorTag", 'history', q.history, 'evidenceOk', q."evidenceOk")), '[]') FROM "QuestionAnswer" q WHERE q."attemptId" = a.id) AS answers
        FROM "PassageAttempt" a
        WHERE a."passageId" = (SELECT id FROM pick) AND a."invalidatedAt" IS NULL AND a."userId" IN (SELECT id FROM mem)
        ORDER BY a."userId", a."startedAt" DESC
      ) t) AS attempts,
      -- every question number answered in any counted attempt (a newer, still empty attempt must not hide them)
      (SELECT coalesce(array_agg(DISTINCT q.number ORDER BY q.number), '{}') FROM "QuestionAnswer" q JOIN "PassageAttempt" a ON a.id = q."attemptId"
        WHERE a."passageId" = (SELECT id FROM pick) AND a."invalidatedAt" IS NULL AND a."userId" IN (SELECT id FROM mem)) AS numbers`;
  const passageId = data!.passageId;
  if (!passageId) return null;
  const students = data!.students.map((u) => ({ userId: u.id, user: u }));
  const date = (v: number | null) => (v === null ? null : new Date(v));
  const latest = new Map(data!.attempts.map((a) => [a.userId, { ...a, firstSubmittedAt: date(a.firstSubmittedAt), completedAt: date(a.completedAt) }]));

  const numbers = data!.numbers;
  const rows = students.map(({ user }) => {
    const a = latest.get(user.id);
    const t = telemetryOf(a?.telemetry ?? {});
    const order = t.answerOrder ?? [];
    const auto = !!a && isAutoFinish(a.submissionReason);
    const byNumber = new Map(a?.answers.map((q) => [q.number, q]) ?? []);
    const cells: (HeatCell | null)[] = numbers.map((n) => {
      const q = byNumber.get(n);
      if (!q) return null;
      const first = (q.history as History)[0];
      const proof = (q.history as History).slice(1).at(-1)?.evidence ?? first?.evidence ?? null;
      return {
        number: n,
        firstCorrect: q.firstCorrect,
        correct: q.correct,
        tries: q.tries,
        errorTag: q.errorTag,
        firstAnswer: first?.answer ?? "",
        unansweredAuto: auto && !first?.answer,
        timeSec: t.perQuestionSec?.[n] ?? null,
        orderPos: order.indexOf(n) >= 0 ? order.indexOf(n) + 1 : null,
        evidenceParagraph: proof ? paragraphLetter(proof.paragraph) : null,
        evidenceOk: q.evidenceOk,
      };
    });
    return {
      id: user.id,
      name: user.name,
      attemptId: a?.id ?? null,
      submitted: !!a?.firstSubmittedAt,
      completed: !!a?.completedAt,
      firstCorrect: a?.firstCorrect ?? null,
      total: a?.total ?? null,
      band: a?.band ?? null,
      seconds: a?.firstSeconds ?? null,
      answeredCount: order.length,
      badge: a ? attemptBadge("reading", { ...a, seconds: a.firstSeconds }) : null,
      cells,
      stuck: a ? a.answers.filter((q) => !q.correct && q.tries >= STUCK_TRIES).map((q) => q.number) : [],
    };
  });
  const submitted = rows.filter((r) => r.submitted);
  const questions = numbers.map((n, i) => {
    const wrong = submitted.filter((r) => r.cells[i] && !r.cells[i]!.firstCorrect).length;
    return { number: n, wrong, share: submitted.length ? wrong / submitted.length : 0 };
  });

  // Mistake magnets: per question, the wrong first answer most students gave (blanks are not a "choice").
  const magnets = numbers
    .map((n, i) => {
      const counts = new Map<string, number>();
      for (const r of submitted) {
        const c = r.cells[i];
        if (!c || c.firstCorrect || !c.firstAnswer.trim()) continue;
        const key = c.firstAnswer.trim().toUpperCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const [answer, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
      return { number: n, answer, count, share: submitted.length ? count / submitted.length : 0 };
    })
    .filter((m) => m.count >= 2 || (m.count >= 1 && submitted.length <= 3))
    .sort((a, b) => b.share - a.share || a.number - b.number)
    .slice(0, 3);

  return { passageId, numbers, rows, questions, submitted: submitted.length, magnets };
}

type HeatAttemptJson = {
  id: string;
  userId: string;
  firstSubmittedAt: number | null;
  completedAt: number | null;
  firstCorrect: number | null;
  total: number;
  band: number | null;
  firstSeconds: number | null;
  submissionReason: string;
  integrityReasons: string[];
  integrityEvents: Prisma.JsonValue;
  telemetry: Prisma.JsonValue;
  answers: { number: number; type: string; firstCorrect: boolean; correct: boolean; tries: number; errorTag: ErrorTag | null; history: Prisma.JsonValue; evidenceOk: boolean | null }[];
};

export type ClassAssignment = { id: string; dueAt: Date | null; passageId: string | null; lessonId: string | null; title: string; total: number; done: number; flagged: number };

/** A class's homework (passages, lessons or both), newest first, with how many students have done it: one query. */
export async function classAssignments(classId: string, kind?: "passage" | "lesson"): Promise<ClassAssignment[]> {
  const only = kind === "passage" ? Prisma.sql`AND p.id IS NOT NULL` : kind === "lesson" ? Prisma.sql`AND l.id IS NOT NULL` : Prisma.empty;
  return db.$queryRaw<ClassAssignment[]>`
    SELECT a.id, a."dueAt", p.id AS "passageId", l.id AS "lessonId", coalesce(p.title, l.title) AS title,
           (SELECT count(*) FROM "AssignmentRecipient" r WHERE r."assignmentId" = a.id)::int AS total,
           (SELECT count(*) FROM "AssignmentRecipient" r WHERE r."assignmentId" = a.id AND r."completedAt" IS NOT NULL)::int AS done,
           (SELECT count(*) FROM "AssignmentRecipient" r WHERE r."assignmentId" = a.id AND r."integrityFlagged")::int AS flagged
    FROM "Assignment" a
    LEFT JOIN "Passage" p ON p.id = a."passageId" AND p."archivedAt" IS NULL
    LEFT JOIN "ListeningLesson" l ON l.id = a."lessonId" AND l."archivedAt" IS NULL
    WHERE a."classId" = ${classId} AND (p.id IS NOT NULL OR l.id IS NOT NULL) ${only}
    ORDER BY a."createdAt" DESC`;
}

export type StuckStudent = { userId: string; name: string; passageId: string; title: string; questions: number[] };

/**
 * A class's students (id and name, for the header and the assign forms) and those with a red question after 3 or
 * more tries, on any passage: one query.
 */
export async function classRoster(classId: string): Promise<{ students: { id: string; name: string }[]; stuck: StuckStudent[] }> {
  const [row] = await db.$queryRaw<{ students: { id: string; name: string }[]; stuck: StuckStudent[] }[]>`
    WITH mem AS (SELECT u.id, u.name FROM "Enrollment" e JOIN "User" u ON u.id = e."userId" WHERE e."classId" = ${classId})
    SELECT
      (SELECT coalesce(json_agg(json_build_object('id', id, 'name', name) ORDER BY name), '[]') FROM mem) AS students,
      (SELECT coalesce(json_agg(s ORDER BY s.name, s.title), '[]') FROM (
        SELECT a."userId", m.name, a."passageId", p.title, array_agg(q.number ORDER BY q.number) AS questions
        FROM "QuestionAnswer" q
        JOIN "PassageAttempt" a ON a.id = q."attemptId"
        JOIN mem m ON m.id = a."userId"
        JOIN "Passage" p ON p.id = a."passageId"
        WHERE q.correct = false AND q.tries >= ${STUCK_TRIES} AND a."invalidatedAt" IS NULL AND a."completedAt" IS NULL
        GROUP BY a."userId", m.name, a."passageId", p.title
      ) s) AS stuck`;
  return row!;
}

/** Students in a class with a red question after 3 or more tries, on any passage. */
export async function stuckStudents(classId: string) {
  return (await classRoster(classId)).stuck;
}

export type ReviewHealth = { reviews: number; timed: number; medianMs: number | null; suspicious: number; spammed: boolean };

/**
 * Flashcard study quality per student over the last `days`: how many reviews, the median time per card (card
 * shown → rating) and how many were under 1.2 s, and whether it looks clicked through. One query, counted by the
 * database; reviews from before times were measured (durationMs 0) are left out of the speed numbers.
 */
export async function reviewHealth(userIds: string[], days = 7): Promise<Map<string, ReviewHealth>> {
  const result = new Map<string, ReviewHealth>();
  if (!userIds.length) return result;
  const rows = await db.$queryRaw<(ReviewHealthRow & { userId: string })[]>`
    SELECT u.id AS "userId", rh.* FROM "User" u CROSS JOIN LATERAL (${reviewHealthColumns(Prisma.sql`u.id`, addDays(new Date(), -days))}) rh
    WHERE u.id IN (${Prisma.join(userIds)}) AND rh.reviews > 0`;
  for (const r of rows) result.set(r.userId, reviewHealthOf(r));
  return result;
}

type ReviewHealthRow = { reviews: number; timed: number; medianMs: number | null; under: number; newTimed: number; newEasyFast: number };

/** The flashcard-speed numbers for the user `user` of the surrounding query, as a subquery for a lateral join. */
export function reviewHealthColumns(user: Prisma.Sql, since: Date) {
  return Prisma.sql`
    SELECT count(*)::int AS reviews,
           (count(*) FILTER (WHERE "durationMs" > 0))::int AS timed,
           (percentile_disc(0.5) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE "durationMs" > 0))::int AS "medianMs",
           (count(*) FILTER (WHERE "durationMs" > 0 AND "durationMs" < 1200))::int AS under,
           (count(*) FILTER (WHERE "durationMs" > 0 AND "queue" = 'NEW'))::int AS "newTimed",
           (count(*) FILTER (WHERE "durationMs" > 0 AND "durationMs" < 2000 AND "queue" = 'NEW' AND "rating" = 4))::int AS "newEasyFast"
    FROM "ReviewLog" WHERE "userId" = ${user} AND "at" >= ${utc(since)}`;
}

export function reviewHealthOf(r: ReviewHealthRow): ReviewHealth {
  return { reviews: r.reviews, timed: r.timed, medianMs: r.medianMs, suspicious: r.under, spammed: isSpam(r) };
}

type MatrixAssignment = {
  id: string;
  passageId: string | null;
  lessonId: string | null;
  dueAt: number | null;
  proctoringPolicy: ProctoringPolicy;
  requireVocabFirst: boolean;
  title: string | null;
  wordCount: number | null;
  deckId: string | null;
};
type MatrixRecipient = {
  studentId: string;
  name: string;
  completedAt: number | null;
  vocabCompletedAt: number | null;
  integrityFlagged: boolean;
  deck: { total: number; seen: number; learning: number; known: number; due: number; reviewedToday: number; highlights: number } | null;
  review: ReviewHealthRow | null;
};
type AttemptJsonBase = {
  id: string;
  userId: string;
  firstSubmittedAt: number | null;
  completedAt: number | null;
  testStartedAt: number | null;
  firstCorrect: number | null;
  band: number | null;
  submissionReason: string;
  integrityReasons: string[];
  integrityEvents: Prisma.JsonValue;
  telemetry: Prisma.JsonValue;
};
type MatrixPassageAttempt = AttemptJsonBase & { total: number; firstSeconds: number | null; red: number; untagged: number; wrongParagraphProofs: number };
type MatrixLessonAttempt = AttemptJsonBase & { vocabSeenAt: number | null; total: number; red: number };

export type HomeworkRow = {
  studentId: string;
  name: string;
  attemptId: string | null;
  /** passage: none → started → submitted → corrected; lesson: none → vocab → started → submitted → corrected */
  stage: "none" | "vocab" | "started" | "submitted" | "corrected";
  firstCorrect: number | null;
  total: number | null;
  band: number | null;
  /** red questions left, and corrected ones still waiting for their "why" tag (passages) */
  red: number;
  untagged: number;
  /** corrected answers whose proof was in a different paragraph from the teacher's evidence */
  wrongParagraphProofs: number;
  done: boolean;
  doneAt: Date | null;
  vocabAt: Date | null;
  flagged: boolean;
  badge: Badge | null;
  deck: { total: number; seen: number; learning: number; known: number; dueToday: number; reviewedToday: number; highlights: number } | null;
  review: ReviewHealth | null;
};

/**
 * One homework item for the whole class, as three checks per student: the timed first try, the corrections ("Prove
 * it" + tags for a passage, all green for a lesson), and the vocabulary (the linked deck today, cards made from
 * highlights). With the integrity badge and the flashcard speed check. A fixed handful of queries, whatever the
 * class size.
 */
export async function homeworkMatrix(classId: string, selected: string | null) {
  const now = new Date();
  const since = addDays(now, -7);
  // The homework (the one asked for if it is this class's and not archived, else the newest), its students, each
  // one's latest attempt with the answers counted, their deck progress and flashcard speed: one statement.
  const [data] = await db.$queryRaw<{ assignment: MatrixAssignment | null; recipients: MatrixRecipient[]; passageAttempts: MatrixPassageAttempt[]; lessonAttempts: MatrixLessonAttempt[] }[]>`
    WITH pick AS (
      SELECT a.id, a."passageId", a."lessonId", a."dueAt", a."proctoringPolicy", a."requireVocabFirst",
             coalesce(p.title, l.title) AS title, l."wordCount",
             (SELECT d.id FROM "Deck" d WHERE (a."passageId" IS NOT NULL AND d."passageId" = a."passageId") OR (a."lessonId" IS NOT NULL AND d."lessonId" = a."lessonId") LIMIT 1) AS "deckId"
      FROM "Assignment" a
      LEFT JOIN "Passage" p ON p.id = a."passageId" AND p."archivedAt" IS NULL
      LEFT JOIN "ListeningLesson" l ON l.id = a."lessonId" AND l."archivedAt" IS NULL
      WHERE a."classId" = ${classId} AND (p.id IS NOT NULL OR l.id IS NOT NULL)
      ORDER BY (a.id = ${selected}::text) DESC NULLS LAST, a."createdAt" DESC
      LIMIT 1
    ),
    rec AS (
      SELECT r."studentId", u.name, r."completedAt", r."vocabCompletedAt", r."integrityFlagged"
      FROM "AssignmentRecipient" r JOIN "User" u ON u.id = r."studentId" WHERE r."assignmentId" = (SELECT id FROM pick)
    )
    SELECT
      (SELECT row_to_json(x) FROM (SELECT id, "passageId", "lessonId", ${ms(Prisma.sql`"dueAt"`)} AS "dueAt", "proctoringPolicy", "requireVocabFirst", title, "wordCount", "deckId" FROM pick) x) AS assignment,
      (SELECT coalesce(json_agg(json_build_object(
          'studentId', rec."studentId", 'name', rec.name, 'completedAt', ${ms(Prisma.sql`rec."completedAt"`)}, 'vocabCompletedAt', ${ms(Prisma.sql`rec."vocabCompletedAt"`)},
          'integrityFlagged', rec."integrityFlagged",
          'deck', CASE WHEN (SELECT "deckId" FROM pick) IS NULL THEN NULL ELSE json_build_object(
            'total', (SELECT count(*) FROM "Card" c WHERE c."deckId" = (SELECT "deckId" FROM pick) AND c."ownerId" IS NULL),
            'seen', (SELECT count(*) FROM "CardState" s JOIN "Card" c ON c.id = s."cardId" WHERE c."deckId" = (SELECT "deckId" FROM pick) AND s."userId" = rec."studentId" AND s.queue <> 'NEW'),
            'learning', (SELECT count(*) FROM "CardState" s JOIN "Card" c ON c.id = s."cardId" WHERE c."deckId" = (SELECT "deckId" FROM pick) AND s."userId" = rec."studentId" AND s.queue IN ('LEARNING', 'RELEARNING')),
            'known', (SELECT count(*) FROM "CardState" s JOIN "Card" c ON c.id = s."cardId" WHERE c."deckId" = (SELECT "deckId" FROM pick) AND s."userId" = rec."studentId" AND s.queue = 'REVIEW' AND s.interval >= ${KNOWN_INTERVAL}),
            'due', (SELECT count(*) FROM "CardState" s JOIN "Card" c ON c.id = s."cardId" WHERE c."deckId" = (SELECT "deckId" FROM pick) AND s."userId" = rec."studentId" AND s.queue <> 'NEW' AND s.due <= ${utc(endOfDay(now))}),
            'reviewedToday', (SELECT count(DISTINCT l."cardId") FROM "ReviewLog" l JOIN "Card" c ON c.id = l."cardId" WHERE c."deckId" = (SELECT "deckId" FROM pick) AND l."userId" = rec."studentId" AND l.at >= ${utc(startOfDay(now))}),
            'highlights', (SELECT count(*) FROM "Card" c WHERE c."deckId" = (SELECT "deckId" FROM pick) AND c."ownerId" = rec."studentId")) END,
          'review', (SELECT row_to_json(h) FROM (${reviewHealthColumns(Prisma.sql`rec."studentId"`, since)}) h)
        ) ORDER BY rec.name), '[]') FROM rec) AS recipients,
      (SELECT coalesce(json_agg(t), '[]') FROM (
        SELECT DISTINCT ON (a."userId") a.id, a."userId", ${ms(Prisma.sql`a."firstSubmittedAt"`)} AS "firstSubmittedAt", ${ms(Prisma.sql`a."completedAt"`)} AS "completedAt",
               ${ms(Prisma.sql`a."testStartedAt"`)} AS "testStartedAt", a."firstCorrect", a.total, a.band, a."firstSeconds",
               a."submissionReason", a."integrityReasons", a."integrityEvents", a.telemetry,
               (SELECT count(*) FROM "QuestionAnswer" q WHERE q."attemptId" = a.id AND NOT q.correct)::int AS red,
               (SELECT count(*) FROM "QuestionAnswer" q WHERE q."attemptId" = a.id AND q.correct AND NOT q."firstCorrect" AND q."errorTag" IS NULL)::int AS untagged,
               (SELECT count(*) FROM "QuestionAnswer" q WHERE q."attemptId" = a.id AND q.correct AND NOT q."firstCorrect" AND q."evidenceOk" = false)::int AS "wrongParagraphProofs"
        FROM "PassageAttempt" a
        WHERE a."passageId" = (SELECT "passageId" FROM pick) AND a."invalidatedAt" IS NULL AND a."userId" IN (SELECT "studentId" FROM rec)
        ORDER BY a."userId", a."startedAt" DESC
      ) t) AS "passageAttempts",
      (SELECT coalesce(json_agg(t), '[]') FROM (
        -- each visit to a lesson starts a fresh practice: the latest one with results, not an empty new one
        SELECT DISTINCT ON (a."userId") a.id, a."userId", ${ms(Prisma.sql`a."firstSubmittedAt"`)} AS "firstSubmittedAt", ${ms(Prisma.sql`a."completedAt"`)} AS "completedAt",
               ${ms(Prisma.sql`a."testStartedAt"`)} AS "testStartedAt", ${ms(Prisma.sql`a."vocabSeenAt"`)} AS "vocabSeenAt", a."firstCorrect", a.band,
               a."submissionReason", a."integrityReasons", a."integrityEvents", a.telemetry,
               (SELECT count(*) FROM jsonb_each(a.answers))::int AS total,
               (SELECT count(*) FROM jsonb_each(a.answers) e WHERE (e.value->>'correct')::boolean IS NOT TRUE)::int AS red
        FROM "ListeningAttempt" a
        WHERE a."lessonId" = (SELECT "lessonId" FROM pick) AND a."invalidatedAt" IS NULL AND a."userId" IN (SELECT "studentId" FROM rec)
        ORDER BY a."userId", (a."firstSubmittedAt" IS NOT NULL) DESC, a."startedAt" DESC
      ) t) AS "lessonAttempts"`;
  const assignment = data?.assignment;
  if (!assignment) return null;
  const kind = assignment.passageId ? ("reading" as const) : ("listening" as const);
  const deckId = assignment.deckId;
  const date = (v: number | null) => (v === null ? null : new Date(v));
  const passageAttempts = data.passageAttempts.map((a) => ({ ...a, firstSubmittedAt: date(a.firstSubmittedAt), completedAt: date(a.completedAt), testStartedAt: date(a.testStartedAt) }));
  const lessonAttempts = data.lessonAttempts.map((a) => ({
    ...a,
    firstSubmittedAt: date(a.firstSubmittedAt),
    completedAt: date(a.completedAt),
    testStartedAt: date(a.testStartedAt),
    vocabSeenAt: date(a.vocabSeenAt),
  }));
  const recipients = data.recipients.map((r) => ({ ...r, completedAt: date(r.completedAt), vocabCompletedAt: date(r.vocabCompletedAt) }));

  const rows: HomeworkRow[] = recipients.map((r) => {
    const deck = r.deck;
    const base = {
      studentId: r.studentId,
      name: r.name,
      done: !!r.completedAt,
      doneAt: r.completedAt,
      vocabAt: r.vocabCompletedAt,
      flagged: r.integrityFlagged,
      deck: deck ? { total: deck.total, seen: deck.seen, learning: deck.learning, known: deck.known, dueToday: deck.due + deck.reviewedToday, reviewedToday: deck.reviewedToday, highlights: deck.highlights } : null,
      review: r.review && r.review.reviews > 0 ? reviewHealthOf(r.review) : null,
    };
    if (kind === "reading") {
      const a = passageAttempts.find((x) => x.userId === r.studentId);
      const stage = !a ? "none" : a.completedAt ? "corrected" : a.firstSubmittedAt ? "submitted" : a.testStartedAt ? "started" : "none";
      return {
        ...base,
        attemptId: a?.firstSubmittedAt ? a.id : null,
        stage,
        firstCorrect: a?.firstCorrect ?? null,
        total: a?.total ?? null,
        band: a?.band ?? null,
        red: a?.red ?? 0,
        untagged: a?.untagged ?? 0,
        wrongParagraphProofs: a?.wrongParagraphProofs ?? 0,
        badge: a?.firstSubmittedAt ? attemptBadge("reading", { ...a, seconds: a.firstSeconds }) : null,
      };
    }
    // Each visit to a lesson starts a fresh practice: show the latest one with results, not an empty new one.
    const a = lessonAttempts.find((x) => x.userId === r.studentId);
    const stage = !a ? "none" : a.completedAt ? "corrected" : a.firstSubmittedAt ? "submitted" : a.testStartedAt ? "started" : a.vocabSeenAt || !assignment.wordCount ? "vocab" : "none";
    const seconds = a?.firstSubmittedAt && a.testStartedAt ? Math.round((a.firstSubmittedAt.getTime() - a.testStartedAt.getTime()) / 1000) : null;
    return {
      ...base,
      attemptId: a?.firstSubmittedAt ? a.id : null,
      stage,
      firstCorrect: a?.firstCorrect ?? null,
      total: a?.total || null,
      band: a?.band ?? null,
      red: a?.red ?? 0,
      untagged: 0,
      wrongParagraphProofs: 0,
      badge: a?.firstSubmittedAt ? attemptBadge("listening", { ...a, seconds }) : null,
    };
  });

  return {
    id: assignment.id,
    kind,
    title: assignment.title ?? "",
    contentId: assignment.passageId ?? assignment.lessonId!,
    dueAt: date(assignment.dueAt),
    policy: assignment.proctoringPolicy,
    requireVocabFirst: assignment.requireVocabFirst,
    hasDeck: !!deckId,
    rows,
  };
}
