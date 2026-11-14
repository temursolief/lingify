import "server-only";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { addDays, dayKey, dayOf, startOfDayValue, weekStart } from "./time";
import { crownsFrom, fortressOf } from "./fortress";
import { recount } from "./xp-recount";
import { AUTO_FINISH_REASONS } from "./telemetry";
import {
  classGoal,
  fromTenths,
  isRealDay,
  levelOf,
  questsFor,
  streakOf,
  UNHURRIED_MS,
  XP,
  XP_LOSS,
  type DayCounts,
  type Quest,
  type XpEvent,
} from "./xp";

type History = { answer: string; correct: boolean; at: string }[];

/**
 * Everything the given students did, as XP events, in five queries however many students there are. With `since`,
 * only events from then on; without it, all of them. Pages never call this directly: it is how `refreshXp` recounts
 * the XpDay rollup they read.
 *
 * Only the first valid attempt at each passage or lesson earns XP, per answer right at the first try: practising a
 * passage again counts for the streak but not for points, so the same content cannot be farmed. A flagged first try
 * earns nothing, and neither do its corrections; a retaken one (invalidated) is left out entirely. A first try that
 * ended because the student left the test costs XP, flagged or not.
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
        firstCorrect: true,
        submissionReason: true,
        integrityFlagged: true,
        answers: { where: { firstCorrect: false, correct: true }, select: { evidenceOk: true, errorTag: true, history: true } },
      },
    }),
    // Every lesson try ever (cheap: no answers), so a repeat inside the window is still known to be a repeat.
    db.listeningAttempt.findMany({
      where: { userId: users, invalidatedAt: null, firstSubmittedAt: { not: null } },
      orderBy: { firstSubmittedAt: "asc" },
      select: { userId: true, lessonId: true, firstSubmittedAt: true, firstCorrect: true, submissionReason: true, integrityFlagged: true },
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
    list.push({ kind: "first", at: a.firstSubmittedAt!, xp: earns ? (a.firstCorrect ?? 0) * XP.correct : 0 });
    if (firstIds.has(a.id) && AUTO_FINISH_REASONS.includes(a.submissionReason)) list.push({ kind: "left", at: a.firstSubmittedAt!, xp: -XP_LOSS.leftTest });
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
    const isFirst = !seenLesson.has(key);
    const earns = isFirst && !l.integrityFlagged;
    seenLesson.add(key);
    const list = result.get(l.userId)!;
    list.push({ kind: "first", at: l.firstSubmittedAt!, xp: earns ? (l.firstCorrect ?? 0) * XP.correct : 0 });
    if (isFirst && AUTO_FINISH_REASONS.includes(l.submissionReason)) list.push({ kind: "left", at: l.firstSubmittedAt!, xp: -XP_LOSS.leftTest });
  }
  for (const r of reviews) result.get(r.userId)!.push({ kind: "card", at: r.at, xp: r.durationMs >= UNHURRIED_MS ? XP.card : 0 });
  for (const h of homework) result.get(h.studentId)!.push({ kind: "homework", at: h.completedAt!, xp: h.integrityFlagged ? 0 : XP.homework });

  if (since) for (const [id, list] of result) result.set(id, list.filter((e) => e.at >= since));
  return result;
}

/**
 * Brings the XpDay rollup up to date for these students. A student needs it when something changed (marked by
 * `markXpDirty`) or when days have passed since their last row: missed days are charged here, the first time anyone
 * looks after midnight, because a missed day is exactly the day with nothing written to mark it.
 *
 * Each such student is recounted from the first day that needs it through yesterday: the day's earned XP from the
 * events, minus what the day cost (`missedDayPenalties`), never taking the total below where the student's current
 * fortress stage began. The stored `xp` of a day is that final change, so sums over days are exact and a loss never
 * needs to be recomputed when only the page is read. Clean students cost two indexed lookups. The rows are locked
 * while the days are replaced, so two pages recounting the same student at once take turns, and the second one skips
 * a student the first already brought up to date.
 */
export async function refreshXp(userIds: string[]) {
  if (!userIds.length) return;
  const today = dayOf(new Date());
  const yesterday = addDays(today, -1);
  const [users, lasts] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, xpDirtyFrom: true, xpDirtySeq: true } }),
    db.xpDay.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _max: { day: true } }),
  ]);
  const lastDay = new Map(lasts.map((l) => [l.userId, l._max.day!]));

  // Marked by a change, or days have passed since the last row (nothing marks those, so it is noticed here).
  const todo = users
    .map((u) => {
      const last = lastDay.get(u.id) ?? null;
      const wasDirty = !!u.xpDirtyFrom;
      if (!wasDirty && !(last && last < yesterday)) return null;
      let from = wasDirty ? dayOf(u.xpDirtyFrom!) : addDays(last!, 1);
      // Days after the last row were never charged: start there if that is earlier.
      if (last && addDays(last, 1) < from) from = addDays(last, 1);
      return { id: u.id, from, seq: u.xpDirtySeq, wasDirty, last };
    })
    .filter((u) => !!u);
  if (!todo.length) return;

  const earliest = new Date(Math.min(...todo.map((u) => u.from.getTime())));
  const [events, prior] = await Promise.all([
    xpEvents(
      todo.map((u) => u.id),
      startOfDayValue(earliest),
    ),
    // Everything before each student's first recounted day: the running total and the history the streak walk needs.
    db.xpDay.findMany({
      where: { OR: todo.map((u) => ({ userId: u.id, day: { lt: u.from } })) },
      select: { userId: true, day: true, xp: true, first: true, proofs: true, cards: true },
    }),
  ]);
  const priorOf = new Map<string, typeof prior>();
  for (const r of prior) priorOf.set(r.userId, [...(priorOf.get(r.userId) ?? []), r]);

  await db.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; xpDirtyFrom: Date | null; xpDirtySeq: number }[]>`
        SELECT "id", "xpDirtyFrom", "xpDirtySeq" FROM "User" WHERE "id" IN (${Prisma.join(todo.map((u) => u.id))}) ORDER BY "id" FOR UPDATE`;
      const now = new Map(locked.map((u) => [u.id, u]));
      // Skip anyone another page recounted while we were reading (cleared), or who changed since (dirty again, maybe
      // from a day we did not read): the next read handles them.
      const lastNow = await tx.xpDay.groupBy({ by: ["userId"], where: { userId: { in: todo.filter((u) => !u.wasDirty).map((u) => u.id) } }, _max: { day: true } });
      const lastNowOf = new Map(lastNow.map((l) => [l.userId, l._max.day!.getTime()]));
      // Skip anyone another page recounted while we were reading (cleared, or their days already charged), or who
      // changed since (dirty again, maybe from a day we did not read): the next read handles them.
      const ready = todo.filter((u) => {
        const current = now.get(u.id);
        if (!current) return false;
        if (u.wasDirty) return !!current.xpDirtyFrom && current.xpDirtySeq === u.seq;
        return !current.xpDirtyFrom && lastNowOf.get(u.id) === u.last!.getTime();
      });
      if (!ready.length) return;
      const rows = ready.flatMap((u) => recount(u.id, u.from, events.get(u.id) ?? [], priorOf.get(u.id) ?? [], today));
      // A fixed four round trips however many students: the database may be far away.
      await tx.xpDay.deleteMany({ where: { OR: ready.map((u) => ({ userId: u.id, day: { gte: u.from } })) } });
      if (rows.length) await tx.xpDay.createMany({ data: rows });
      await tx.user.updateMany({ where: { id: { in: ready.map((u) => u.id) } }, data: { xpDirtyFrom: null } });
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

export type Game = {
  /** points, to one decimal */
  xp: number;
  level: number;
  levelFrom: number;
  levelTo: number;
  /** this week's change: negative if penalties outweighed earnings */
  weekXp: number;
  /** today's change so far (a test walked out of makes it negative) */
  todayXp: number;
  streak: number;
  bestStreak: number;
  shields: number;
  todayDone: boolean;
  quests: Quest[];
  /** what is still owed today: a real action (streak) and flashcards (words) */
  owed: { streak: boolean; words: boolean; shieldCovers: boolean };
  /** yesterday's cost, when it was a net loss */
  yesterday: { xp: number; idle: boolean; noWords: boolean } | null;
};

/** One student's XP, level, streak, shields and today's quests, from their XpDay rows. Cached for the request. */
export const studentGame = cache(async (userId: string): Promise<Game> => {
  await refreshXp([userId]);
  const rows = await db.xpDay.findMany({ where: { userId }, select: { day: true, xp: true, first: true, proofs: true, cards: true } });
  const today = dayOf(new Date());
  const monday = weekStart(today);
  // Only days with real activity start and shape the streak: rows that only carry a charge or a marker do not.
  const days = new Map<string, DayCounts>(rows.filter((r) => r.first || r.proofs || r.cards).map((r) => [dayKey(r.day), { first: r.first, proofs: r.proofs, cards: r.cards }]));
  const sum = (keep: (day: Date) => boolean) => fromTenths(rows.reduce((n, r) => (keep(r.day) ? n + r.xp : n), 0));
  const xp = sum(() => true);
  const { level, from, to } = levelOf(xp);
  const { streak, best, shields, todayDone } = streakOf(days, today);
  const todayCounts = days.get(dayKey(today));
  const lost = rows.find((r) => r.day.getTime() === addDays(today, -1).getTime() && r.xp < 0);
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
    quests: questsFor(todayCounts),
    owed: { streak: !todayDone, words: !todayCounts?.cards, shieldCovers: streak > 0 && shields > 0 },
    yesterday: lost ? { xp: fromTenths(lost.xp), idle: !isRealDay(lost), noWords: !lost.cards } : null,
  };
});

export type LeagueRow = {
  id: string;
  name: string;
  /** this week's XP: what the league ranks by */
  xp: number;
  you: boolean;
  /** all-time XP, level and fortress stage: what classmates see of each other's castles */
  totalXp: number;
  level: number;
  stage: number;
  /** weeks finished first in this class */
  crowns: number;
};
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
  /** who won last week (several if tied), when the league ran with at least two students */
  lastChampions: string[];
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
  const [week, total, weeks] = await Promise.all([
    db.xpDay.groupBy({ by: ["userId"], where: { userId: { in: ids }, day: { gte: monday } }, _sum: { xp: true } }),
    db.xpDay.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _sum: { xp: true } }),
    // Every finished week's XP per student (weeks start on Monday, like the league), for crowns.
    db.$queryRaw<{ userId: string; week: Date; xp: bigint }[]>`
      SELECT "userId", date_trunc('week', "day")::date AS "week", SUM("xp") AS "xp"
      FROM "XpDay" WHERE "userId" IN (${Prisma.join(ids)}) AND "day" < ${dayKey(monday)}::date
      GROUP BY 1, 2`,
  ]);
  const weekXpOf = new Map(week.map((w) => [w.userId, fromTenths(w._sum.xp ?? 0)]));
  const totalOf = new Map(total.map((w) => [w.userId, fromTenths(w._sum.xp ?? 0)]));
  const weekRows = weeks.map((w) => ({ userId: w.userId, week: dayKey(w.week), xp: fromTenths(Number(w.xp)) }));
  const crowns = crownsFrom(weekRows);
  const lastKey = dayKey(addDays(monday, -7));
  const lastChampionIds = crownsFrom(weekRows.filter((w) => w.week === lastKey));
  const league = members
    .map((m) => {
      const totalXp = totalOf.get(m.id) ?? 0;
      return {
        id: m.id,
        name: m.name,
        // The ranking never shows less than nothing: a week of penalties is a zero.
        xp: Math.max(0, weekXpOf.get(m.id) ?? 0),
        you: m.id === userId,
        totalXp,
        level: levelOf(totalXp).level,
        stage: fortressOf(totalXp).stage,
        crowns: crowns.get(m.id) ?? 0,
      };
    })
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
    lastChampions: members.filter((m) => lastChampionIds.has(m.id)).map((m) => m.name),
  };
});
