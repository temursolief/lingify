import "server-only";
import { Prisma, type ErrorTag } from "@/generated/prisma/client";
import { db } from "./db";
import { GROUP_LABEL, paragraphLetter, type GroupType } from "./passage-format";
import { integrityBadge, isAutoFinish, isSpam, type AttemptTelemetry, type Badge, type IntegrityEvent } from "./telemetry";
import { addDays, endOfDay, startOfDay } from "./time";

/** Questions a student retried this many times and still has red are flagged to the teacher. */
export const STUCK_TRIES = 3;
/** A review card this many days apart counts as "known" (Anki's "mature" is 21 days, past Lingify's 20-day cap). */
const KNOWN_INTERVAL = 7;

/** Attempts that count: a retake the teacher required replaces the old one in every number. */
const counted = { invalidatedAt: null } as const;

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
export async function errorBreakdown(userIds: string[]): Promise<ErrorBreakdown> {
  const [rows, passages] = await Promise.all([
    db.questionAnswer.findMany({
      where: { firstCorrect: false, attempt: { ...counted, userId: { in: userIds }, firstSubmittedAt: { not: null } } },
      select: { type: true, errorTag: true, evidenceOk: true, correct: true },
    }),
    db.passageAttempt.count({ where: { ...counted, userId: { in: userIds }, firstSubmittedAt: { not: null } } }),
  ]);
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
export async function passageHeatmap(classId: string, passageId: string) {
  const students = await db.enrollment.findMany({ where: { classId }, include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } });
  const attempts = await db.passageAttempt.findMany({
    where: { ...counted, passageId, userId: { in: students.map((s) => s.userId) } },
    orderBy: { startedAt: "desc" },
    include: { answers: { select: { number: true, type: true, firstCorrect: true, correct: true, tries: true, errorTag: true, history: true, evidenceOk: true } } },
  });
  // The latest attempt per student.
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) if (!latest.has(a.userId)) latest.set(a.userId, a);

  const numbers = [...new Set(attempts.flatMap((a) => a.answers.map((q) => q.number)))].sort((a, b) => a - b);
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

  return { numbers, rows, questions, submitted: submitted.length, magnets };
}

/** Students in a class with a red question after 3 or more tries, on any passage. */
export async function stuckStudents(classId: string) {
  const ids = (await db.enrollment.findMany({ where: { classId }, select: { userId: true } })).map((e) => e.userId);
  const rows = await db.questionAnswer.findMany({
    where: { correct: false, tries: { gte: STUCK_TRIES }, attempt: { ...counted, userId: { in: ids }, completedAt: null } },
    include: { attempt: { select: { userId: true, passageId: true, user: { select: { name: true } }, passage: { select: { title: true } } } } },
  });
  const grouped = new Map<string, { userId: string; name: string; passageId: string; title: string; questions: number[] }>();
  for (const r of rows) {
    const key = `${r.attempt.userId}:${r.attempt.passageId}`;
    const g = grouped.get(key) ?? { userId: r.attempt.userId, name: r.attempt.user.name, passageId: r.attempt.passageId, title: r.attempt.passage.title, questions: [] };
    g.questions.push(r.number);
    grouped.set(key, g);
  }
  return [...grouped.values()];
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
  const since = addDays(new Date(), -days);
  const rows = await db.$queryRaw<{ userId: string; reviews: number; timed: number; medianMs: number | null; under: number; newTimed: number; newEasyFast: number }[]>`
    SELECT "userId",
           count(*)::int AS reviews,
           (count(*) FILTER (WHERE "durationMs" > 0))::int AS timed,
           (percentile_disc(0.5) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE "durationMs" > 0))::int AS "medianMs",
           (count(*) FILTER (WHERE "durationMs" > 0 AND "durationMs" < 1200))::int AS under,
           (count(*) FILTER (WHERE "durationMs" > 0 AND "queue" = 'NEW'))::int AS "newTimed",
           (count(*) FILTER (WHERE "durationMs" > 0 AND "durationMs" < 2000 AND "queue" = 'NEW' AND "rating" = 4))::int AS "newEasyFast"
    FROM "ReviewLog"
    WHERE "userId" IN (${Prisma.join(userIds)}) AND "at" >= ${since}
    GROUP BY "userId"`;
  for (const r of rows) {
    result.set(r.userId, { reviews: r.reviews, timed: r.timed, medianMs: r.medianMs, suspicious: r.under, spammed: isSpam(r) });
  }
  return result;
}

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
export async function homeworkMatrix(classId: string, assignmentId: string) {
  const assignment = await db.assignment.findFirst({
    where: { id: assignmentId, classId },
    include: {
      passage: { select: { id: true, title: true, deck: { select: { id: true } } } },
      lesson: { select: { id: true, title: true, wordCount: true, deck: { select: { id: true } } } },
      recipients: { include: { student: { select: { id: true, name: true } } }, orderBy: { student: { name: "asc" } } },
    },
  });
  if (!assignment) return null;
  const ids = assignment.recipients.map((r) => r.studentId);
  const kind = assignment.passageId ? ("reading" as const) : ("listening" as const);
  const deckId = assignment.passage?.deck?.id ?? assignment.lesson?.deck?.id ?? null;
  const now = new Date();

  const [passageAttempts, lessonAttempts, deckRows, health] = await Promise.all([
    assignment.passageId
      ? db.passageAttempt.findMany({
          where: { ...counted, passageId: assignment.passageId, userId: { in: ids } },
          orderBy: { startedAt: "desc" },
          include: { answers: { select: { correct: true, firstCorrect: true, errorTag: true, evidenceOk: true } } },
        })
      : Promise.resolve([]),
    assignment.lessonId
      ? db.listeningAttempt.findMany({ where: { ...counted, lessonId: assignment.lessonId, userId: { in: ids } }, orderBy: { startedAt: "desc" } })
      : Promise.resolve([]),
    deckId && ids.length
      ? db.$queryRaw<{ userId: string; total: number; seen: number; learning: number; known: number; due: number; reviewedToday: number; highlights: number }[]>`
          SELECT u."id" AS "userId",
                 (SELECT count(*)::int FROM "Card" c WHERE c."deckId" = ${deckId} AND c."ownerId" IS NULL) AS total,
                 (SELECT count(*)::int FROM "CardState" s JOIN "Card" c ON c."id" = s."cardId" WHERE c."deckId" = ${deckId} AND s."userId" = u."id" AND s."queue" <> 'NEW') AS seen,
                 (SELECT count(*)::int FROM "CardState" s JOIN "Card" c ON c."id" = s."cardId" WHERE c."deckId" = ${deckId} AND s."userId" = u."id" AND s."queue" IN ('LEARNING', 'RELEARNING')) AS learning,
                 (SELECT count(*)::int FROM "CardState" s JOIN "Card" c ON c."id" = s."cardId" WHERE c."deckId" = ${deckId} AND s."userId" = u."id" AND s."queue" = 'REVIEW' AND s."interval" >= ${KNOWN_INTERVAL}) AS known,
                 (SELECT count(*)::int FROM "CardState" s JOIN "Card" c ON c."id" = s."cardId" WHERE c."deckId" = ${deckId} AND s."userId" = u."id" AND s."queue" <> 'NEW' AND s."due" <= ${endOfDay(now)}) AS due,
                 (SELECT count(DISTINCT l."cardId")::int FROM "ReviewLog" l JOIN "Card" c ON c."id" = l."cardId" WHERE c."deckId" = ${deckId} AND l."userId" = u."id" AND l."at" >= ${startOfDay(now)}) AS "reviewedToday",
                 (SELECT count(*)::int FROM "Card" c WHERE c."deckId" = ${deckId} AND c."ownerId" = u."id") AS highlights
          FROM "User" u WHERE u."id" IN (${Prisma.join(ids)})`
      : Promise.resolve([]),
    reviewHealth(ids),
  ]);

  const rows: HomeworkRow[] = assignment.recipients.map((r) => {
    const deck = deckRows.find((d) => d.userId === r.studentId);
    const base = {
      studentId: r.studentId,
      name: r.student.name,
      done: !!r.completedAt,
      doneAt: r.completedAt,
      vocabAt: r.vocabCompletedAt,
      flagged: r.integrityFlagged,
      deck: deck ? { total: deck.total, seen: deck.seen, learning: deck.learning, known: deck.known, dueToday: deck.due + deck.reviewedToday, reviewedToday: deck.reviewedToday, highlights: deck.highlights } : null,
      review: health.get(r.studentId) ?? null,
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
        red: a?.answers.filter((q) => !q.correct).length ?? 0,
        untagged: a?.answers.filter((q) => q.correct && !q.firstCorrect && !q.errorTag).length ?? 0,
        wrongParagraphProofs: a?.answers.filter((q) => !q.firstCorrect && q.correct && q.evidenceOk === false).length ?? 0,
        badge: a?.firstSubmittedAt ? attemptBadge("reading", { ...a, seconds: a.firstSeconds }) : null,
      };
    }
    // Each visit to a lesson starts a fresh practice: show the latest one with results, not an empty new one.
    const a = lessonAttempts.find((x) => x.userId === r.studentId && x.firstSubmittedAt) ?? lessonAttempts.find((x) => x.userId === r.studentId);
    const answers = Object.values((a?.answers ?? {}) as Record<string, { correct: boolean }>);
    const stage = !a ? "none" : a.completedAt ? "corrected" : a.firstSubmittedAt ? "submitted" : a.testStartedAt ? "started" : a.vocabSeenAt || !assignment.lesson?.wordCount ? "vocab" : "none";
    const seconds = a?.firstSubmittedAt && a.testStartedAt ? Math.round((a.firstSubmittedAt.getTime() - a.testStartedAt.getTime()) / 1000) : null;
    return {
      ...base,
      attemptId: a?.firstSubmittedAt ? a.id : null,
      stage,
      firstCorrect: a?.firstCorrect ?? null,
      total: answers.length || null,
      band: a?.band ?? null,
      red: answers.filter((q) => !q.correct).length,
      untagged: 0,
      wrongParagraphProofs: 0,
      badge: a?.firstSubmittedAt ? attemptBadge("listening", { ...a, seconds }) : null,
    };
  });

  return {
    id: assignment.id,
    kind,
    title: assignment.passage?.title ?? assignment.lesson?.title ?? "",
    contentId: assignment.passageId ?? assignment.lessonId!,
    dueAt: assignment.dueAt,
    policy: assignment.proctoringPolicy,
    requireVocabFirst: assignment.requireVocabFirst,
    hasDeck: !!deckId,
    rows,
  };
}
