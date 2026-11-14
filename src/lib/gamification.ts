import "server-only";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { dayFromJson } from "./sql";
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
/** Days have passed since a student's last stored day (given as Date or "YYYY-MM-DD"), so missed days may be owed. */
function isStale(last: Date | string | null, today: Date) {
  if (!last) return false;
  const day = typeof last === "string" ? dayFromJson(last) : last;
  return day < addDays(today, -1);
}

export async function refreshXp(userIds: string[]) {
  if (!userIds.length) return;
  const today = dayOf(new Date());
  const yesterday = addDays(today, -1);
  // Who is marked, and each one's last stored day: one query.
  const users = await db.$queryRaw<{ id: string; xpDirtyFrom: Date | null; xpDirtySeq: number; last: Date | null }[]>`
    SELECT u.id, u."xpDirtyFrom", u."xpDirtySeq", (SELECT max(d.day) FROM "XpDay" d WHERE d."userId" = u.id) AS last
    FROM "User" u WHERE u.id IN (${Prisma.join(userIds)})`;
  const lastDay = new Map(users.filter((u) => u.last).map((u) => [u.id, u.last!]));

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
  const today = dayOf(new Date());
  // One query reads the rows and whether they are up to date; only when they are not (a change, or a new day to
  // charge) is the student recounted and read again.
  const read = async () =>
    (
      await db.$queryRaw<{ dirty: boolean; rows: { day: string; xp: number; first: number; proofs: number; cards: number }[] }[]>`
        SELECT u."xpDirtyFrom" IS NOT NULL AS dirty,
               coalesce((SELECT json_agg(json_build_object('day', d.day, 'xp', d.xp, 'first', d.first, 'proofs', d.proofs, 'cards', d.cards) ORDER BY d.day)
                         FROM "XpDay" d WHERE d."userId" = u.id), '[]') AS rows
        FROM "User" u WHERE u.id = ${userId}`
    )[0];
  let state = await read();
  if (state && (state.dirty || isStale(state.rows.at(-1)?.day ?? null, today))) {
    await refreshXp([userId]);
    state = await read();
  }
  const rows = (state?.rows ?? []).map((r) => ({ ...r, day: dayFromJson(r.day) }));
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
type ClassRow = {
  id: string;
  name: string;
  leagueEnabled: boolean;
  teacherName: string;
  members: { id: string; name: string; dirty: boolean; last: string | null; week: number; total: number }[];
  weeks: { userId: string; week: string; xp: number }[];
};

export const classGame = cache(async (userId: string): Promise<ClassGame | null> => {
  const today = dayOf(new Date());
  const monday = weekStart(today);
  // The class, its members with their week and all-time XP, and every finished week for crowns: one statement.
  // Members whose XP is not up to date are recounted first and the statement read again (the uncommon path).
  const read = async () =>
    (
      await db.$queryRaw<ClassRow[]>`
        WITH me AS (SELECT e."classId" FROM "Enrollment" e WHERE e."userId" = ${userId} AND e.status = 'APPROVED' ORDER BY e."joinedAt" DESC LIMIT 1),
        mem AS (SELECT u.id, u.name, u."xpDirtyFrom" IS NOT NULL AS dirty FROM "Enrollment" e JOIN "User" u ON u.id = e."userId" WHERE e."classId" = (SELECT "classId" FROM me) AND e.status = 'APPROVED')
        SELECT c.id, c.name, c."leagueEnabled", t.name AS "teacherName",
          (SELECT coalesce(json_agg(json_build_object(
             'id', m.id, 'name', m.name, 'dirty', m.dirty,
             'last', (SELECT max(d.day) FROM "XpDay" d WHERE d."userId" = m.id),
             'week', (SELECT coalesce(sum(d.xp), 0) FROM "XpDay" d WHERE d."userId" = m.id AND d.day >= ${dayKey(monday)}::date),
             'total', (SELECT coalesce(sum(d.xp), 0) FROM "XpDay" d WHERE d."userId" = m.id))), '[]') FROM mem m) AS members,
          (SELECT coalesce(json_agg(w), '[]') FROM (
             SELECT d."userId", date_trunc('week', d.day)::date AS week, sum(d.xp)::int AS xp
             FROM "XpDay" d WHERE d."userId" IN (SELECT id FROM mem) AND d.day < ${dayKey(monday)}::date GROUP BY 1, 2) w) AS weeks
        FROM "Class" c JOIN "User" t ON t.id = c."teacherId" WHERE c.id = (SELECT "classId" FROM me)`
    )[0] ?? null;
  let cls = await read();
  if (!cls) return null;
  if (cls.members.some((m) => m.dirty || isStale(m.last, today))) {
    await refreshXp(cls.members.map((m) => m.id));
    cls = (await read())!;
  }
  const members = cls.members.map((m) => ({ id: m.id, name: m.name }));
  const week = cls.members.map((m) => ({ userId: m.id, _sum: { xp: m.week } }));
  const total = cls.members.map((m) => ({ userId: m.id, _sum: { xp: m.total } }));
  const weeks = cls.weeks;
  const weekXpOf = new Map(week.map((w) => [w.userId, fromTenths(w._sum.xp ?? 0)]));
  const totalOf = new Map(total.map((w) => [w.userId, fromTenths(w._sum.xp ?? 0)]));
  const weekRows = weeks.map((w) => ({ userId: w.userId, week: w.week.slice(0, 10), xp: fromTenths(Number(w.xp)) }));
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
    teacherName: cls.teacherName,
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
