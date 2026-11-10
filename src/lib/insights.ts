import "server-only";
import type { ErrorTag } from "@/generated/prisma/client";
import { db } from "./db";
import { GROUP_LABEL, type GroupType } from "./passage-format";

/** Questions a student retried this many times and still has red are flagged to the teacher. */
export const STUCK_TRIES = 3;

export type ErrorBreakdown = {
  passages: number;
  mistakes: number;
  tags: Record<ErrorTag, number>;
  /** mistakes per question type, with the tag counts inside each */
  byType: { type: GroupType; label: string; mistakes: number; tags: Partial<Record<ErrorTag, number>> }[];
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
      where: { firstCorrect: false, attempt: { userId: { in: userIds }, firstSubmittedAt: { not: null } } },
      select: { type: true, errorTag: true, evidenceOk: true, correct: true },
    }),
    db.passageAttempt.count({ where: { userId: { in: userIds }, firstSubmittedAt: { not: null } } }),
  ]);
  const tags: Record<ErrorTag, number> = { VOCAB: 0, DISTRACTOR: 0, LOGIC: 0, CARELESS: 0 };
  const byType = new Map<GroupType, { mistakes: number; tags: Partial<Record<ErrorTag, number>> }>();
  let location = 0;
  let comprehension = 0;
  for (const r of rows) {
    const type = r.type as GroupType;
    const entry = byType.get(type) ?? { mistakes: 0, tags: {} };
    entry.mistakes++;
    if (r.errorTag) {
      tags[r.errorTag]++;
      entry.tags[r.errorTag] = (entry.tags[r.errorTag] ?? 0) + 1;
    }
    byType.set(type, entry);
    if (r.evidenceOk === false) location++;
    else if (r.evidenceOk === true) comprehension++;
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

/** First-attempt results of a class on one passage: who got which question right the first time, and who is stuck. */
export async function passageHeatmap(classId: string, passageId: string) {
  const students = await db.enrollment.findMany({ where: { classId }, include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } });
  const attempts = await db.passageAttempt.findMany({
    where: { passageId, userId: { in: students.map((s) => s.userId) } },
    orderBy: { startedAt: "desc" },
    include: { answers: { select: { number: true, firstCorrect: true, correct: true, tries: true, errorTag: true } } },
  });
  // The latest attempt per student.
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) if (!latest.has(a.userId)) latest.set(a.userId, a);

  const numbers = [...new Set(attempts.flatMap((a) => a.answers.map((q) => q.number)))].sort((a, b) => a - b);
  const rows = students.map(({ user }) => {
    const a = latest.get(user.id);
    const byNumber = new Map(a?.answers.map((q) => [q.number, q]) ?? []);
    return {
      id: user.id,
      name: user.name,
      submitted: !!a?.firstSubmittedAt,
      completed: !!a?.completedAt,
      firstCorrect: a?.firstCorrect ?? null,
      total: a?.total ?? null,
      band: a?.band ?? null,
      cells: numbers.map((n) => byNumber.get(n) ?? null),
      stuck: a ? a.answers.filter((q) => !q.correct && q.tries >= STUCK_TRIES).map((q) => q.number) : [],
    };
  });
  const submitted = rows.filter((r) => r.submitted);
  const questions = numbers.map((n, i) => {
    const wrong = submitted.filter((r) => r.cells[i] && !r.cells[i]!.firstCorrect).length;
    return { number: n, wrong, share: submitted.length ? wrong / submitted.length : 0 };
  });
  return { numbers, rows, questions, submitted: submitted.length };
}

/** Students in a class with a red question after 3 or more tries, on any passage. */
export async function stuckStudents(classId: string) {
  const ids = (await db.enrollment.findMany({ where: { classId }, select: { userId: true } })).map((e) => e.userId);
  const rows = await db.questionAnswer.findMany({
    where: { correct: false, tries: { gte: STUCK_TRIES }, attempt: { userId: { in: ids }, completedAt: null } },
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
