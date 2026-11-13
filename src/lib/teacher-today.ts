import "server-only";
import { cache } from "react";
import { db } from "./db";
import { passageHeatmap, stuckStudents } from "./insights";
import { addDays, formatDay } from "./time";

/** Days without opening Lingify, with homework open, before a student shows up on the teacher's list. */
const INACTIVE_DAYS = 5;
/** How long a flagged first try stays on the list (a retake removes it sooner). */
const FLAG_DAYS = 14;

export type Attention = {
  id: string;
  tone: "bad" | "warn" | "accent" | "muted";
  title: string;
  meta: string;
  href: string;
  /** the one-click fix offered beside "Open" */
  action: { kind: "retake"; attemptKind: "passage" | "lesson"; attemptId: string; name: string } | { kind: "nudge"; studentId: string; name: string; linked: boolean } | { kind: "link"; label: string; href: string };
};

export type DueSoon = { id: string; classId: string; className: string; title: string; kind: "reading" | "listening"; dueAt: Date | null; done: number; total: number };

const ago = (d: Date | null) => {
  if (!d) return "never opened Lingify";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

/**
 * What needs this teacher today, worst first: students stuck on a question, flagged first tries, questions that
 * tricked most of a class, and students who have gone quiet with homework open. Plus homework coming due.
 */
export const teacherToday = cache(async (teacherId: string) => {
  const classes = await db.class.findMany({ where: { teacherId }, select: { id: true, name: true, _count: { select: { enrollments: true } } }, orderBy: { createdAt: "desc" } });
  const classIds = classes.map((c) => c.id);
  const enrollments = await db.enrollment.findMany({ where: { classId: { in: classIds } }, select: { userId: true, classId: true } });
  const studentIds = [...new Set(enrollments.map((e) => e.userId))];
  const classOf = new Map(enrollments.map((e) => [e.userId, e.classId]));
  const flagSince = addDays(new Date(), -FLAG_DAYS);
  const quietSince = addDays(new Date(), -INACTIVE_DAYS);
  const mineFlag = { userId: { in: studentIds }, integrityFlagged: true, invalidatedAt: null, firstSubmittedAt: { gte: flagSince } };

  const [stuck, flaggedReading, flaggedListening, quiet, assignments, linked] = await Promise.all([
    Promise.all(classIds.map(async (id) => (await stuckStudents(id)).map((s) => ({ ...s, classId: id })))).then((r) => r.flat()),
    db.passageAttempt.findMany({ where: mineFlag, select: { id: true, userId: true, band: true, firstSeconds: true, integrityReasons: true, user: { select: { name: true } }, passage: { select: { title: true } } } }),
    db.listeningAttempt.findMany({ where: mineFlag, select: { id: true, userId: true, band: true, integrityReasons: true, user: { select: { name: true } }, lesson: { select: { title: true } } } }),
    db.user.findMany({
      where: {
        id: { in: studentIds },
        OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: quietSince } }],
        recipients: { some: { completedAt: null, assignment: { class: { teacherId } } } },
      },
      select: { id: true, name: true, lastActiveAt: true, telegramChatId: true, _count: { select: { recipients: { where: { completedAt: null, assignment: { class: { teacherId } } } } } } },
    }),
    db.assignment.findMany({
      where: { classId: { in: classIds }, OR: [{ dueAt: null }, { dueAt: { gte: addDays(new Date(), -2) } }], AND: [{ OR: [{ passage: { archivedAt: null } }, { lesson: { archivedAt: null } }] }] },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 6,
      select: {
        id: true,
        classId: true,
        dueAt: true,
        passageId: true,
        class: { select: { name: true } },
        passage: { select: { title: true } },
        lesson: { select: { title: true } },
        recipients: { select: { completedAt: true } },
      },
    }),
    db.user.findMany({ where: { id: { in: studentIds }, telegramChatId: { not: null } }, select: { id: true } }).then((r) => new Set(r.map((u) => u.id))),
  ]);

  // The latest passage each class was given: its most popular wrong answer, if it tricked half the class or more.
  const latestPassage = new Map<string, { passageId: string; title: string }>();
  for (const a of await db.assignment.findMany({ where: { classId: { in: classIds }, passageId: { not: null } }, orderBy: { createdAt: "desc" }, select: { classId: true, passageId: true, passage: { select: { title: true } } } })) {
    if (!latestPassage.has(a.classId)) latestPassage.set(a.classId, { passageId: a.passageId!, title: a.passage!.title });
  }
  const magnets = (
    await Promise.all(
      [...latestPassage.entries()].map(async ([classId, p]) => {
        const heat = await passageHeatmap(classId, p.passageId);
        const top = heat.magnets[0];
        return top && heat.submitted >= 3 && top.share >= 0.5 ? { classId, ...p, ...top, submitted: heat.submitted } : null;
      }),
    )
  ).filter((m) => m !== null);

  const student = (id: string) => `/teacher/classes/${classOf.get(id)}/students/${id}`;
  const items: Attention[] = [
    ...stuck.map(
      (s): Attention => ({
        id: `stuck:${s.userId}:${s.passageId}`,
        tone: "bad",
        title: `${s.name} is stuck on ${s.questions.length > 1 ? "questions" : "question"} ${s.questions.sort((a, b) => a - b).join(", ")} of “${s.title}”`,
        meta: "Three or more wrong tries and still red",
        href: student(s.userId),
        action: { kind: "nudge", studentId: s.userId, name: s.name, linked: linked.has(s.userId) },
      }),
    ),
    ...flaggedReading.map(
      (a): Attention => ({
        id: `flag:${a.id}`,
        tone: "bad",
        title: `${a.user.name}'s first try at “${a.passage.title}” was flagged`,
        meta: [a.band !== null && `Band ${a.band}`, a.firstSeconds && `${Math.round(a.firstSeconds / 60)} min`, a.integrityReasons.length && a.integrityReasons.map(reasonLabel).join(", ")].filter(Boolean).join(" · "),
        href: student(a.userId),
        action: { kind: "retake", attemptKind: "passage", attemptId: a.id, name: a.user.name },
      }),
    ),
    ...flaggedListening.map(
      (a): Attention => ({
        id: `flag:${a.id}`,
        tone: "bad",
        title: `${a.user.name}'s first try at “${a.lesson.title}” was flagged`,
        meta: [a.band !== null && `Band ${a.band}`, a.integrityReasons.length && a.integrityReasons.map(reasonLabel).join(", ")].filter(Boolean).join(" · "),
        href: student(a.userId),
        action: { kind: "retake", attemptKind: "lesson", attemptId: a.id, name: a.user.name },
      }),
    ),
    ...magnets.map(
      (m): Attention => ({
        id: `magnet:${m.classId}:${m.number}`,
        tone: "warn",
        title: `${m.count} of ${m.submitted} chose ${m.answer} on Q${m.number}`,
        meta: `“${m.title}” · ${classes.find((c) => c.id === m.classId)?.name}. Worth five minutes in class`,
        href: `/teacher/classes/${m.classId}?tab=passages&p=${m.passageId}`,
        action: { kind: "link", label: "See insights", href: `/teacher/classes/${m.classId}?tab=passages&p=${m.passageId}` },
      }),
    ),
    ...quiet.map(
      (u): Attention => ({
        id: `quiet:${u.id}`,
        tone: "muted",
        title: `${u.name} has been quiet`,
        meta: `Last active ${ago(u.lastActiveAt)} · ${u._count.recipients} homework open`,
        href: student(u.id),
        action: { kind: "nudge", studentId: u.id, name: u.name, linked: !!u.telegramChatId },
      }),
    ),
  ];

  const dueSoon: DueSoon[] = assignments.map((a) => ({
    id: a.id,
    classId: a.classId,
    className: a.class.name,
    title: a.passage?.title ?? a.lesson?.title ?? "",
    kind: a.passageId ? "reading" : "listening",
    dueAt: a.dueAt,
    done: a.recipients.filter((r) => r.completedAt).length,
    total: a.recipients.length,
  }));

  return { items, dueSoon, classes: classes.length, students: studentIds.length };
});

const REASONS: Record<string, string> = {
  UNREALISTIC_SPEED_HIGH_SCORE: "high score, very fast",
  ANSWER_KEY_SUSPECTED: "answer key suspected",
  LOCATING_SKILL_MISMATCH: "proofs in the wrong place",
  TAB_HIDDEN: "left the test",
  WINDOW_BLUR: "left the window",
  FULLSCREEN_EXIT: "left full screen",
};

function reasonLabel(r: string) {
  return REASONS[r] ?? r.toLowerCase().replaceAll("_", " ");
}

export const dueLabel = (d: Date | null) => (d ? formatDay(d, true) : "no due date");
