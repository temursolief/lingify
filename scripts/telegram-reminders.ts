/**
 * Sends Telegram reminders. Run it from a scheduler (cron) in the evening:
 *   npm run telegram:remind            students with flashcards due or an unfinished passage from their teacher
 *   npm run telegram:remind -- --weekly  also a 7-day summary to every teacher
 *   npm run telegram:remind -- --dry-run print every student's reminder instead of sending
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { dueToday } from "../src/lib/decks";
import { STUCK_TRIES } from "../src/lib/insights";
import { sendMessage, studentReminder, teacherSummary, telegramConfigured } from "../src/lib/telegram";

async function reminderFor(userId: string) {
  const [due, open] = await Promise.all([
    dueToday(userId),
    db.assignmentRecipient.findMany({
      where: { studentId: userId, completedAt: null, assignment: { passageId: { not: null }, passage: { archivedAt: null } } },
      include: { assignment: { include: { passage: { select: { title: true } } } } },
    }),
  ]);
  const now = new Date();
  const tasks = [
    ...(due ? [`Review ${due} flashcard${due === 1 ? "" : "s"}`] : []),
    ...open.filter((a) => !a.assignment.dueAt || a.assignment.dueAt >= now).map((a) => `Passage: ${a.assignment.passage!.title}`),
  ];
  const overdue = open.filter((a) => a.assignment.dueAt && a.assignment.dueAt < now).map((a) => a.assignment.passage!.title);
  return { tasks, overdue, needed: tasks.length + overdue.length > 0 };
}

async function remindStudents() {
  const students = await db.user.findMany({ where: { role: "STUDENT", telegramChatId: { not: null }, enrollments: { some: { status: "APPROVED" } } } });
  let sent = 0;
  for (const s of students) {
    const r = await reminderFor(s.id);
    if (r.needed && (await sendMessage(s.telegramChatId!, studentReminder(s.name, r.tasks, r.overdue)))) sent++;
  }
  console.log(`student reminders sent: ${sent} of ${students.length} connected`);
}

async function summariseForTeachers() {
  const teachers = await db.user.findMany({
    where: { role: "TEACHER", telegramChatId: { not: null } },
    include: { classesTaught: { include: { enrollments: { where: { status: "APPROVED" }, include: { user: { select: { id: true, name: true } } } } } } },
  });
  const since = new Date(Date.now() - 7 * 86_400_000);
  for (const t of teachers) {
    for (const cls of t.classesTaught) {
      if (!cls.enrollments.length) continue;
      const rows = await Promise.all(
        cls.enrollments.map(async ({ user }) => {
          const [attempts, cards, stuck] = await Promise.all([
            db.passageAttempt.findMany({ where: { userId: user.id, invalidatedAt: null, firstSubmittedAt: { gte: since } }, select: { band: true } }),
            db.reviewLog.count({ where: { userId: user.id, at: { gte: since } } }),
            db.questionAnswer.count({ where: { correct: false, tries: { gte: STUCK_TRIES }, attempt: { userId: user.id, invalidatedAt: null, completedAt: null } } }),
          ]);
          const bands = attempts.map((a) => a.band!).filter((b) => b !== null);
          return { name: user.name, passages: attempts.length, cards, stuck, band: bands.length ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 2) / 2 : null };
        }),
      );
      await sendMessage(t.telegramChatId!, teacherSummary(cls.name, rows));
    }
  }
  console.log(`teacher summaries sent to ${teachers.length} teachers`);
}

async function dryRun() {
  for (const s of await db.user.findMany({ where: { role: "STUDENT" } })) {
    const r = await reminderFor(s.id);
    console.log(`--- ${s.email}${r.needed ? "" : " (nothing to do, no reminder)"}`);
    if (r.needed) console.log(studentReminder(s.name, r.tasks, r.overdue));
  }
}

async function main() {
  if (process.argv.includes("--dry-run")) return dryRun();
  if (!telegramConfigured()) {
    console.log("Telegram is not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME); nothing sent.");
    return;
  }
  await remindStudents();
  if (process.argv.includes("--weekly")) await summariseForTeachers();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
