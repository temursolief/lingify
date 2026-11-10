import "server-only";
import { db } from "./db";
import { libraryFor } from "./recommend";
import { addDays, dayKey, dayOf } from "./time";
import { dueWhere } from "./vocab";

/** Reviews per day that count as "review done" when more than this many are due. */
export const DAILY_REVIEW_TARGET = 20;
export const DEFAULT_DAILY_MINUTES = 20;

export type PlanDay = "complete" | "partial" | "missed";

export async function dailyMinutesFor(userId: string) {
  const classes = await db.enrollment.findMany({ where: { userId }, select: { class: { select: { dailyMinutes: true } } } });
  return classes.length ? Math.max(...classes.map((c) => c.class.dailyMinutes)) : DEFAULT_DAILY_MINUTES;
}

/** Today's three tasks: clear due reviews, finish one text, and reach the teacher's daily minutes. */
export async function dailyPlan(userId: string) {
  const now = new Date();
  const today = dayOf(now);
  const [due, reviewsToday, textsToday, time, targetMinutes, assignments, library] = await Promise.all([
    db.lemmaState.count({ where: dueWhere(userId, now) }),
    db.exerciseAttempt.count({ where: { userId, kind: "REVIEW", answeredAt: { gte: today } } }),
    db.readingSession.findMany({ where: { userId, completedAt: { gte: today } }, select: { text: { select: { title: true } } } }),
    db.activityTime.aggregate({ where: { userId, day: today, activity: { not: "PLACEMENT" } }, _sum: { seconds: true } }),
    dailyMinutesFor(userId),
    db.assignmentRecipient.findMany({
      where: { studentId: userId, completedAt: null, assignment: { kind: "TEXT" } },
      include: { assignment: { include: { text: { select: { slug: true, title: true } } } } },
      orderBy: { assignment: { dueAt: { sort: "asc", nulls: "last" } } },
    }),
    libraryFor(userId),
  ]);

  const minutes = Math.floor((time._sum.seconds ?? 0) / 60);
  const reviewDone = due === 0 || reviewsToday >= DAILY_REVIEW_TARGET;
  const nextAssigned = assignments.find((a) => library.find((t) => t.slug === a.assignment.text?.slug)?.level !== "locked");
  const suggestion = nextAssigned?.assignment.text ?? library.find((t) => t.level !== "locked" && !t.completed) ?? null;

  const tasks = [
    {
      id: "review",
      label: reviewDone ? "Review your words" : `Review your words (${Math.min(due, DAILY_REVIEW_TARGET - reviewsToday)} to go)`,
      done: reviewDone,
      detail: reviewDone ? (reviewsToday ? `${reviewsToday} reviewed today` : "Nothing due") : `${reviewsToday} done today`,
      href: "/student/review",
    },
    {
      id: "read",
      label: textsToday.length ? "Read one text" : suggestion ? `Read “${suggestion.title}”` : "Read one text",
      done: textsToday.length > 0,
      detail: textsToday.length ? `Finished “${textsToday[0].text.title}”` : nextAssigned ? "Assigned by your teacher" : "Recommended for you",
      href: suggestion ? `/student/read/${suggestion.slug}` : "/student/library",
    },
    {
      id: "minutes",
      label: `Practise for ${targetMinutes} minutes`,
      done: minutes >= targetMinutes,
      detail: `${minutes} of ${targetMinutes} minutes`,
      href: "/student/library",
    },
  ];

  return {
    tasks,
    complete: tasks.every((t) => t.done),
    minutes,
    targetMinutes,
    assignments: assignments.map((a) => ({
      id: a.assignmentId,
      title: a.assignment.text?.title ?? "",
      slug: a.assignment.text?.slug ?? "",
      dueAt: a.assignment.dueAt,
      overdue: !!a.assignment.dueAt && a.assignment.dueAt < now,
      note: a.assignment.note,
    })),
  };
}

/**
 * Daily plan history for a group of students. A past day counts as complete when the student finished a text
 * and reached the minutes target; any activity at all makes it partial.
 */
export async function planHistory(userIds: string[], targetMinutes: number, days = 14) {
  const today = dayOf(new Date());
  const since = addDays(today, -(days - 1));
  const [times, sessions] = await Promise.all([
    db.activityTime.groupBy({ by: ["userId", "day"], where: { userId: { in: userIds }, day: { gte: since }, activity: { not: "PLACEMENT" } }, _sum: { seconds: true } }),
    db.readingSession.findMany({ where: { userId: { in: userIds }, completedAt: { gte: since } }, select: { userId: true, completedAt: true } }),
  ]);
  const minutes = new Map(times.map((t) => [`${t.userId}:${dayKey(t.day)}`, Math.floor((t._sum.seconds ?? 0) / 60)]));
  const read = new Set(sessions.map((s) => `${s.userId}:${dayKey(dayOf(s.completedAt!))}`));
  const dayKeys = Array.from({ length: days }, (_, i) => dayKey(addDays(since, i)));

  const byUser = new Map<string, PlanDay[]>();
  for (const id of userIds) {
    byUser.set(
      id,
      dayKeys.map((d) => {
        const m = minutes.get(`${id}:${d}`) ?? 0;
        const r = read.has(`${id}:${d}`);
        return r && m >= targetMinutes ? "complete" : r || m > 0 ? "partial" : "missed";
      }),
    );
  }
  return { days: dayKeys, byUser };
}
