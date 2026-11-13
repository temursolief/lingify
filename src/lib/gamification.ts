import "server-only";
import { cache } from "react";
import { db } from "./db";
import { addDays, dayKey, dayOf, startOfDayValue, weekStart } from "./time";
import {
  classGoal,
  countsByDay,
  levelOf,
  questsFor,
  streakOf,
  totalXp,
  UNHURRIED_MS,
  XP,
  type Quest,
  type XpEvent,
} from "./xp";

type History = { answer: string; correct: boolean; at: string }[];

/**
 * Everything the given students did, as XP events, in five queries however many students there are. With `since`,
 * only events from then on (the weekly league); without it, all of them (a student's own total).
 *
 * Only the first valid attempt at each passage or lesson earns XP: practising a passage again counts for the streak
 * but not for points, so the same content cannot be farmed. A flagged first try earns nothing, and neither do its
 * corrections; a retaken one (invalidated) is left out entirely.
 */
export async function xpEvents(userIds: string[], since?: Date): Promise<Map<string, XpEvent[]>> {
  const result = new Map<string, XpEvent[]>(userIds.map((id) => [id, []]));
  if (!userIds.length) return result;
  const users = { in: userIds };
  // An attempt can only have events in the window if it was submitted in it, or is still being corrected, or finished in it.
  const recent = since ? { OR: [{ firstSubmittedAt: { gte: since } }, { completedAt: null }, { completedAt: { gte: since } }] } : {};
  const [firsts, attempts, lessons, reviews, homework] = await Promise.all([
    // Which attempt was each student's first at each passage (cheap: no answers).
    db.passageAttempt.findMany({
      where: { userId: users, invalidatedAt: null, firstSubmittedAt: { not: null } },
      orderBy: { firstSubmittedAt: "asc" },
      distinct: ["userId", "passageId"],
      select: { id: true },
    }),
    db.passageAttempt.findMany({
      where: { userId: users, invalidatedAt: null, firstSubmittedAt: { not: null }, ...recent },
      select: {
        id: true,
        userId: true,
        firstSubmittedAt: true,
        integrityFlagged: true,
        answers: { where: { firstCorrect: false, correct: true }, select: { evidenceOk: true, errorTag: true, history: true } },
      },
    }),
    db.listeningAttempt.findMany({
      where: { userId: users, invalidatedAt: null, firstSubmittedAt: since ? { gte: since } : { not: null } },
      orderBy: { firstSubmittedAt: "asc" },
      select: { userId: true, lessonId: true, firstSubmittedAt: true, integrityFlagged: true },
    }),
    db.reviewLog.findMany({ where: { userId: users, ...(since ? { at: { gte: since } } : {}) }, select: { userId: true, at: true, durationMs: true } }),
    db.assignmentRecipient.findMany({
      where: { studentId: users, completedAt: since ? { gte: since } : { not: null } },
      select: { studentId: true, completedAt: true, integrityFlagged: true },
    }),
  ]);

  const firstIds = new Set(firsts.map((f) => f.id));
  for (const a of attempts) {
    const list = result.get(a.userId)!;
    const earns = firstIds.has(a.id) && !a.integrityFlagged;
    list.push({ kind: "first", at: a.firstSubmittedAt!, xp: earns ? XP.firstTry : 0 });
    for (const row of a.answers) {
      // The try that turned the answer green is the last one in its history.
      const fixed = (row.history as History).findLast((h) => h.correct);
      if (!fixed) continue;
      const at = new Date(fixed.at);
      list.push({ kind: "proof", at, xp: earns ? (row.evidenceOk === false ? XP.proofElsewhere : XP.proof) : 0 });
      if (row.errorTag) list.push({ kind: "tag", at, xp: earns ? XP.tag : 0 });
    }
  }
  const seenLesson = new Set<string>();
  for (const l of lessons) {
    const key = `${l.userId}:${l.lessonId}`;
    const earns = !seenLesson.has(key) && !l.integrityFlagged;
    seenLesson.add(key);
    result.get(l.userId)!.push({ kind: "first", at: l.firstSubmittedAt!, xp: earns ? XP.firstTry : 0 });
  }
  for (const r of reviews) result.get(r.userId)!.push({ kind: "card", at: r.at, xp: r.durationMs >= UNHURRIED_MS ? XP.card : 0 });
  for (const h of homework) result.get(h.studentId)!.push({ kind: "homework", at: h.completedAt!, xp: h.integrityFlagged ? 0 : XP.homework });

  if (since) for (const [id, list] of result) result.set(id, list.filter((e) => e.at >= since));
  return result;
}

export type Game = {
  xp: number;
  level: number;
  levelFrom: number;
  levelTo: number;
  weekXp: number;
  todayXp: number;
  streak: number;
  bestStreak: number;
  shields: number;
  todayDone: boolean;
  quests: Quest[];
};

/** One student's XP, level, streak, shields and today's quests. Cached for the request. */
export const studentGame = cache(async (userId: string): Promise<Game> => {
  const events = (await xpEvents([userId])).get(userId)!;
  const now = new Date();
  const today = dayOf(now);
  const days = countsByDay(events, dayOf);
  const xp = totalXp(events);
  const { level, from, to } = levelOf(xp);
  const { streak, best, shields, todayDone } = streakOf(days, today);
  const weekFrom = startOfDayValue(weekStart(today));
  const todayFrom = startOfDayValue(today);
  const sum = (from: Date) => events.reduce((n, e) => (e.at >= from ? n + e.xp : n), 0);
  return {
    xp,
    level,
    levelFrom: from,
    levelTo: to,
    weekXp: sum(weekFrom),
    todayXp: sum(todayFrom),
    streak,
    bestStreak: best,
    shields,
    todayDone,
    quests: questsFor(days.get(dayKey(today))),
  };
});

export type LeagueRow = { id: string; name: string; xp: number; you: boolean };
export type ClassGame = {
  classId: string;
  className: string;
  teacherName: string;
  leagueEnabled: boolean;
  students: number;
  goal: number;
  weekXp: number;
  myWeekXp: number;
  rank: number;
  league: LeagueRow[];
  daysLeft: number;
};

/** The weekly class goal and league for the student's class (the most recently joined, if they are in several). */
export const classGame = cache(async (userId: string): Promise<ClassGame | null> => {
  const enrollment = await db.enrollment.findFirst({
    where: { userId },
    orderBy: { joinedAt: "desc" },
    select: { class: { select: { id: true, name: true, leagueEnabled: true, teacher: { select: { name: true } }, enrollments: { select: { user: { select: { id: true, name: true } } } } } } },
  });
  if (!enrollment) return null;
  const cls = enrollment.class;
  const members = cls.enrollments.map((e) => e.user);
  const today = dayOf(new Date());
  const monday = weekStart(today);
  // Monday 00:00 in the app time zone: the first event that counts for this week.
  const events = await xpEvents(
    members.map((m) => m.id),
    startOfDayValue(monday),
  );
  const league = members
    .map((m) => ({ id: m.id, name: m.name, xp: totalXp(events.get(m.id) ?? []), you: m.id === userId }))
    .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
  const weekXp = league.reduce((n, r) => n + r.xp, 0);
  return {
    classId: cls.id,
    className: cls.name,
    teacherName: cls.teacher.name,
    leagueEnabled: cls.leagueEnabled,
    students: members.length,
    goal: classGoal(members.length),
    weekXp,
    myWeekXp: league.find((r) => r.you)?.xp ?? 0,
    rank: league.findIndex((r) => r.you) + 1,
    league,
    daysLeft: Math.round((addDays(monday, 7).getTime() - today.getTime()) / 86_400_000),
  };
});
