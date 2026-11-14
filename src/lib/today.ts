import "server-only";
import { cache } from "react";
import { db } from "./db";
import { dueTodayFor } from "./decks";
import { formatDay } from "./time";
import { XP } from "./xp";

export type HomeworkState = "todo" | "started" | "correcting" | "words" | "done";

export type HomeworkItem = {
  kind: "reading" | "listening";
  title: string;
  href: string;
  dueAt: Date | null;
  note: string | null;
  state: HomeworkState;
  /** red answers still to fix, once the first try is in */
  left: number;
  firstCorrect: number | null;
  total: number;
  band: number | null;
  completedAt: Date | null;
};

type HomeworkRow = {
  completedAt: Date | null;
  vocabCompletedAt: Date | null;
  dueAt: Date | null;
  note: string | null;
  requireVocabFirst: boolean;
  passageId: string | null;
  passageSlug: string | null;
  passageTitle: string | null;
  questionCount: number | null;
  lessonSlug: string | null;
  lessonTitle: string | null;
  lessonTotal: number | null;
  pStarted: boolean;
  pSubmitted: boolean;
  pCompleted: boolean;
  pFirstCorrect: number | null;
  pTotal: number | null;
  pBand: number | null;
  pWrong: number | null;
  lStarted: boolean;
  lSubmitted: boolean;
  lFirstCorrect: number | null;
  lBand: number | null;
  lWrong: number | null;
};

/**
 * Every piece of homework the student has, with where they are in it: not started, first try under way, answers to
 * correct, key words still to study, or done. Unfinished first, soonest due first. One SQL statement (it was about
 * eight queries): each assignment with its passage or lesson and the student's latest attempt at it, with the red
 * answers counted by the database. Cached for the request: the sidebar badge and the Today screen ask for it.
 */
export const studentHomework = cache(async (userId: string): Promise<HomeworkItem[]> => {
  const rows = await db.$queryRaw<HomeworkRow[]>`
    SELECT r."completedAt", r."vocabCompletedAt", a."dueAt", a.note, a."requireVocabFirst",
           p.id AS "passageId", p.slug AS "passageSlug", p.title AS "passageTitle", p."questionCount",
           l.slug AS "lessonSlug", l.title AS "lessonTitle", l.total AS "lessonTotal",
           pa.id IS NOT NULL AS "pStarted", pa."firstSubmittedAt" IS NOT NULL AS "pSubmitted", pa."completedAt" IS NOT NULL AS "pCompleted",
           pa."firstCorrect" AS "pFirstCorrect", pa.total AS "pTotal", pa.band AS "pBand", pa.wrong AS "pWrong",
           la.id IS NOT NULL AS "lStarted", la."firstSubmittedAt" IS NOT NULL AS "lSubmitted", la."firstCorrect" AS "lFirstCorrect", la.band AS "lBand", la.wrong AS "lWrong"
    FROM "AssignmentRecipient" r
    JOIN "Assignment" a ON a.id = r."assignmentId"
    LEFT JOIN "Passage" p ON p.id = a."passageId" AND p."archivedAt" IS NULL
    LEFT JOIN "ListeningLesson" l ON l.id = a."lessonId" AND l."archivedAt" IS NULL
    LEFT JOIN LATERAL (
      SELECT x.id, x."firstSubmittedAt", x."completedAt", x."firstCorrect", x.total, x.band,
             (SELECT count(*) FROM "QuestionAnswer" q WHERE q."attemptId" = x.id AND q.correct = false)::int AS wrong
      FROM "PassageAttempt" x
      WHERE x."userId" = r."studentId" AND x."passageId" = p.id AND x."invalidatedAt" IS NULL
      ORDER BY x."startedAt" DESC LIMIT 1
    ) pa ON true
    LEFT JOIN LATERAL (
      -- the latest practice with results first: opening a lesson again starts an empty one that should not hide them
      SELECT y.id, y."firstSubmittedAt", y."firstCorrect", y.band,
             (SELECT count(*) FROM jsonb_each(y.answers) e WHERE (e.value->>'correct')::boolean IS NOT TRUE)::int AS wrong
      FROM "ListeningAttempt" y
      WHERE y."userId" = r."studentId" AND y."lessonId" = l.id AND y."invalidatedAt" IS NULL
      ORDER BY y."firstSubmittedAt" DESC NULLS LAST, y."startedAt" DESC LIMIT 1
    ) la ON true
    WHERE r."studentId" = ${userId} AND (p.id IS NOT NULL OR l.id IS NOT NULL)`;

  const items: HomeworkItem[] = rows.map((r) => {
    const base = { dueAt: r.dueAt, note: r.note, completedAt: r.completedAt };
    const wordsLeft = r.requireVocabFirst && !r.vocabCompletedAt;
    if (r.passageId) {
      const left = r.pSubmitted ? (r.pWrong ?? 0) : 0;
      const state: HomeworkState = r.completedAt ? "done" : !r.pStarted ? "todo" : !r.pSubmitted ? "started" : left > 0 || !r.pCompleted ? "correcting" : wordsLeft ? "words" : "done";
      return { ...base, kind: "reading", title: r.passageTitle!, href: `/student/passages/${r.passageSlug}`, state, left, firstCorrect: r.pFirstCorrect, total: r.pTotal ?? r.questionCount!, band: r.pBand };
    }
    const left = r.lSubmitted ? (r.lWrong ?? 0) : 0;
    const state: HomeworkState = r.completedAt ? "done" : !r.lStarted ? "todo" : !r.lSubmitted ? "started" : left > 0 ? "correcting" : wordsLeft ? "words" : "done";
    return { ...base, kind: "listening", title: r.lessonTitle!, href: `/student/listening/${r.lessonSlug}`, state, left, firstCorrect: r.lFirstCorrect, total: r.lessonTotal!, band: r.lBand };
  });
  const dueKey = (i: HomeworkItem) => i.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return items.sort((x, y) => Number(x.state === "done") - Number(y.state === "done") || dueKey(x) - dueKey(y) || x.title.localeCompare(y.title));
});

export type NextUp = { title: string; why: string; href: string; cta: string; xp: number | null };

const quote = (s: string) => `“${s}”`;

/**
 * The one next thing to do, chosen in this order: homework due soonest, then flashcards due, then practice. The
 * reason is shown with it, so the student knows why this and not something else.
 */
export async function nextUp(userId: string): Promise<NextUp> {
  const [homework, due] = await Promise.all([studentHomework(userId), dueTodayFor(userId)]);
  const open = homework.find((h) => h.state !== "done");
  if (open) {
    const dueLabel = open.dueAt ? `, due ${formatDay(open.dueAt, true)}` : "";
    switch (open.state) {
      case "correcting":
        return {
          title: open.left ? `Fix ${open.left} answer${open.left === 1 ? "" : "s"} in ${quote(open.title)}` : `Say why you missed answers in ${quote(open.title)}`,
          why: `Homework${dueLabel}. Each answer you prove earns XP and counts toward today's quests. The right answer is never shown: you find it.`,
          href: open.href,
          cta: "Continue",
          xp: open.left ? open.left * (XP.proof + XP.tag) : XP.tag,
        };
      case "words":
        return { title: `Study the key words for ${quote(open.title)}`, why: `The questions are done. Clear today's cards from its deck to finish the homework.`, href: "/student/flashcards", cta: "Review", xp: XP.homework };
      case "started":
        return { title: `Finish your first try at ${quote(open.title)}`, why: `Homework${dueLabel}. You opened it already: the first try is timed like the exam.`, href: open.href, cta: "Continue", xp: open.total * XP.correct };
      default:
        return {
          title: `Start ${quote(open.title)}`,
          why: `Homework${dueLabel}. ${open.kind === "reading" ? "Reading" : "Listening"} first try in exam mode, then fix your answers with proof.`,
          href: open.href,
          cta: "Start",
          xp: open.total * XP.correct,
        };
    }
  }
  if (due > 0) {
    return { title: `Review ${due} card${due === 1 ? "" : "s"} due today`, why: "Your homework is done. These cards help the new words stick.", href: "/student/flashcards", cta: "Review", xp: due * XP.card };
  }
  return { title: "You're all caught up", why: "No homework and no cards due. Look back at your mistakes to see what to work on next.", href: "/student/progress", cta: "See my journey", xp: null };
}
