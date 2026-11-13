import "server-only";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { addDays, dayKey, dayOf, startOfDayValue, weekStart } from "./time";
import { classGoal, levelOf, questsFor, streakOf, totalsByDay, UNHURRIED_MS, XP, type DayCounts, type Quest, type XpEvent } from "./xp";

type History = { answer: string; correct: boolean; at: string }[];

/**
 * Everything the given students did, as XP events, in five queries however many students there are. With `since`,
 * only events from then on; without it, all of them. Pages never call this directly: it is how `refreshXp` recounts
 * the XpDay rollup they read.
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
    // Every lesson try ever (cheap: no answers), so a repeat inside the window is still known to be a repeat.
    db.listeningAttempt.findMany({
      where: { userId: users, invalidatedAt: null, firstSubmittedAt: { not: null } },
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

/**
 * Brings the XpDay rollup up to date for these students: anyone marked by `markXpDirty` has their days recounted from
 * the first changed day, all of them from one `xpEvents` call. Clean students cost one indexed lookup. The rows are
 * locked while the days are replaced, so two pages recounting the same student at once take turns, and the second
 * one skips a student the first already brought up to date.
 */
export async function refreshXp(userIds: string[]) {
  if (!userIds.length) return;
  const dirty = await db.user.findMany({ where: { id: { in: userIds }, xpDirtyFrom: { not: null } }, select: { id: true, xpDirtyFrom: true, xpDirtySeq: true } });
  if (!dirty.length) return;
  // Whole days: recount from the midnight that starts the first changed day.
  const fromDay = new Map(dirty.map((u) => [u.id, dayOf(u.xpDirtyFrom!)]));
  const earliest = new Date(Math.min(...[...fromDay.values()].map((d) => d.getTime())));
  const events = await xpEvents(
    dirty.map((u) => u.id),
    startOfDayValue(earliest),
  );
  await db.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; xpDirtyFrom: Date | null; xpDirtySeq: number }[]>`
        SELECT "id", "xpDirtyFrom", "xpDirtySeq" FROM "User" WHERE "id" IN (${Prisma.join(dirty.map((u) => u.id))}) ORDER BY "id" FOR UPDATE`;
      const now = new Map(locked.map((u) => [u.id, u]));
      // Skip anyone another page recounted while we were reading (cleared), or who changed since (dirty again, maybe
      // from a day we did not read): the next read handles them.
      const ready = dirty.filter((u) => {
        const current = now.get(u.id);
        return !!current?.xpDirtyFrom && current.xpDirtySeq === u.xpDirtySeq;
      });
      if (!ready.length) return;
      const rows = ready.flatMap((u) => {
        const from = fromDay.get(u.id)!;
        return [...totalsByDay(events.get(u.id) ?? [], dayOf)]
          .map(([key, t]) => ({ userId: u.id, day: new Date(`${key}T00:00:00.000Z`), ...t }))
          .filter((r) => r.day >= from);
      });
      // A fixed four round trips however many students: the database may be far away.
      await tx.xpDay.deleteMany({ where: { OR: ready.map((u) => ({ userId: u.id, day: { gte: fromDay.get(u.id)! } })) } });
      if (rows.length) await tx.xpDay.createMany({ data: rows });
      await tx.user.updateMany({ where: { id: { in: ready.map((u) => u.id) } }, data: { xpDirtyFrom: null } });
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
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

/** One student's XP, level, streak, shields and today's quests, from their XpDay rows. Cached for the request. */
export const studentGame = cache(async (userId: string): Promise<Game> => {
  await refreshXp([userId]);
  const rows = await db.xpDay.findMany({ where: { userId }, select: { day: true, xp: true, first: true, proofs: true, cards: true } });
  const today = dayOf(new Date());
  const monday = weekStart(today);
  const days = new Map<string, DayCounts>(rows.map((r) => [dayKey(r.day), { first: r.first, proofs: r.proofs, cards: r.cards }]));
  const sum = (keep: (day: Date) => boolean) => rows.reduce((n, r) => (keep(r.day) ? n + r.xp : n), 0);
  const xp = sum(() => true);
  const { level, from, to } = levelOf(xp);
  const { streak, best, shields, todayDone } = streakOf(days, today);
  return {
    xp,
    level,
    levelFrom: from,
    levelTo: to,
    weekXp: sum((d) => d >= monday),
    todayXp: sum((d) => d.getTime() === today.getTime()),
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
  const ids = members.map((m) => m.id);
  await refreshXp(ids);
  const week = await db.xpDay.groupBy({ by: ["userId"], where: { userId: { in: ids }, day: { gte: monday } }, _sum: { xp: true } });
  const weekXpOf = new Map(week.map((w) => [w.userId, w._sum.xp ?? 0]));
  const league = members
    .map((m) => ({ id: m.id, name: m.name, xp: weekXpOf.get(m.id) ?? 0, you: m.id === userId }))
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
