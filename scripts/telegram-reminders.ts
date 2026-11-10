/**
 * Sends Telegram reminders. Run it from a scheduler (cron) in the evening:
 *   npm run telegram:remind            students whose daily plan is not finished yet
 *   npm run telegram:remind -- --weekly  also a 7-day summary to every teacher
 *   npm run telegram:remind -- --dry-run print every student's reminder instead of sending
 */
import "dotenv/config";
import { dailyPlan, planHistory } from "../src/lib/daily-plan";
import { db } from "../src/lib/db";
import { flagsFor } from "../src/lib/flags";
import { sendMessage, studentReminder, teacherSummary, telegramConfigured } from "../src/lib/telegram";
import { addDays, dayOf } from "../src/lib/time";

async function remindStudents() {
  const students = await db.user.findMany({ where: { role: "STUDENT", telegramChatId: { not: null }, placementDone: true } });
  let sent = 0;
  for (const s of students) {
    const plan = await dailyPlan(s.id);
    if (plan.complete) continue;
    const overdue = plan.assignments.filter((a) => a.overdue).map((a) => a.title);
    if (await sendMessage(s.telegramChatId!, studentReminder(s.name, plan.tasks, overdue))) sent++;
  }
  console.log(`student reminders sent: ${sent} of ${students.length} connected`);
}

async function summariseForTeachers() {
  const teachers = await db.user.findMany({
    where: { role: "TEACHER", telegramChatId: { not: null } },
    include: { classesTaught: { include: { enrollments: { include: { user: { select: { id: true, name: true } } } } } } },
  });
  const since = addDays(dayOf(new Date()), -6);
  for (const t of teachers) {
    for (const cls of t.classesTaught) {
      const ids = cls.enrollments.map((e) => e.user.id);
      if (!ids.length) continue;
      const history = await planHistory(ids, cls.dailyMinutes, 7);
      const minutes = await db.activityTime.groupBy({ by: ["userId"], where: { userId: { in: ids }, day: { gte: since } }, _sum: { seconds: true } });
      const rows = await Promise.all(
        cls.enrollments.map(async ({ user }) => ({
          name: user.name,
          completeDays: (history.byUser.get(user.id) ?? []).filter((d) => d === "complete").length,
          days: 7,
          minutes: Math.round((minutes.find((m) => m.userId === user.id)?._sum.seconds ?? 0) / 60),
          flags: (await flagsFor(user.id)).map((f) => f.label),
        })),
      );
      await sendMessage(t.telegramChatId!, teacherSummary(cls.name, rows));
    }
  }
  console.log(`teacher summaries sent to ${teachers.length} teachers`);
}

async function dryRun() {
  const students = await db.user.findMany({ where: { role: "STUDENT", placementDone: true } });
  for (const s of students) {
    const plan = await dailyPlan(s.id);
    const overdue = plan.assignments.filter((a) => a.overdue).map((a) => a.title);
    console.log(`--- ${s.email}${plan.complete ? " (plan complete, no reminder)" : ""}`);
    if (!plan.complete) console.log(studentReminder(s.name, plan.tasks, overdue));
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
