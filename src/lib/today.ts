import "server-only";
import { cache } from "react";
import { db } from "./db";
import { dueToday } from "./decks";
import type { ListeningAnswers } from "./listening";
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

/**
 * Every piece of homework the student has, with where they are in it: not started, first try under way, answers to
 * correct, key words still to study, or done. Unfinished first, soonest due first. Cached for the request: the
 * sidebar badge and the Today screen ask for the same thing.
 */
export const studentHomework = cache(async (userId: string): Promise<HomeworkItem[]> => {
  const recipients = await db.assignmentRecipient.findMany({
    where: {
      studentId: userId,
      OR: [{ assignment: { passageId: { not: null }, passage: { archivedAt: null } } }, { assignment: { lessonId: { not: null }, lesson: { archivedAt: null } } }],
    },
    select: {
      completedAt: true,
      vocabCompletedAt: true,
      assignment: {
        select: {
          dueAt: true,
          note: true,
          requireVocabFirst: true,
          passage: { select: { id: true, slug: true, title: true, questionCount: true } },
          lesson: { select: { id: true, slug: true, title: true, total: true } },
        },
      },
    },
  });
  const passageIds = recipients.flatMap((r) => (r.assignment.passage ? [r.assignment.passage.id] : []));
  const lessonIds = recipients.flatMap((r) => (r.assignment.lesson ? [r.assignment.lesson.id] : []));
  const [attempts, listens] = await Promise.all([
    db.passageAttempt.findMany({
      where: { userId, passageId: { in: passageIds }, invalidatedAt: null },
      orderBy: { startedAt: "desc" },
      distinct: ["passageId"],
      select: { passageId: true, firstSubmittedAt: true, completedAt: true, firstCorrect: true, total: true, band: true, _count: { select: { answers: { where: { correct: false } } } } },
    }),
    // The latest practice with results first: opening a lesson again starts an empty one that should not hide them.
    db.listeningAttempt.findMany({
      where: { userId, lessonId: { in: lessonIds }, invalidatedAt: null },
      orderBy: [{ firstSubmittedAt: { sort: "desc", nulls: "last" } }, { startedAt: "desc" }],
      distinct: ["lessonId"],
      select: { lessonId: true, firstSubmittedAt: true, completedAt: true, firstCorrect: true, band: true, answers: true },
    }),
  ]);

  const items: HomeworkItem[] = recipients.map((r) => {
    const a = r.assignment;
    const base = { dueAt: a.dueAt, note: a.note, completedAt: r.completedAt };
    const wordsLeft = a.requireVocabFirst && !r.vocabCompletedAt;
    if (a.passage) {
      const t = attempts.find((x) => x.passageId === a.passage!.id);
      const left = t?.firstSubmittedAt ? t._count.answers : 0;
      const state: HomeworkState = r.completedAt ? "done" : !t ? "todo" : !t.firstSubmittedAt ? "started" : left > 0 || !t.completedAt ? "correcting" : wordsLeft ? "words" : "done";
      return { ...base, kind: "reading", title: a.passage.title, href: `/student/passages/${a.passage.slug}`, state, left, firstCorrect: t?.firstCorrect ?? null, total: t?.total ?? a.passage.questionCount, band: t?.band ?? null };
    }
    const l = a.lesson!;
    const t = listens.find((x) => x.lessonId === l.id);
    const left = t?.firstSubmittedAt ? Object.values(t.answers as ListeningAnswers).filter((q) => !q.correct).length : 0;
    const state: HomeworkState = r.completedAt ? "done" : !t ? "todo" : !t.firstSubmittedAt ? "started" : left > 0 ? "correcting" : wordsLeft ? "words" : "done";
    return { ...base, kind: "listening", title: l.title, href: `/student/listening/${l.slug}`, state, left, firstCorrect: t?.firstCorrect ?? null, total: l.total, band: t?.band ?? null };
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
  const [homework, due] = await Promise.all([studentHomework(userId), dueToday(userId)]);
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
