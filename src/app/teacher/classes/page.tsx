import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Plus, UsersThree } from "@/components/icons";
import { accentOutline, Badge, Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { STUCK_TRIES } from "@/lib/insights";
import { db } from "@/lib/db";
import { utc } from "@/lib/sql";
import { addDays } from "@/lib/time";

export const metadata: Metadata = { title: "Classes" };

/** One card per class, newest first, with how many are active and who is stuck. */
async function ClassesContent() {
  const teacher = await requireTeacher();
  // Each class with its counts, who was active this week and who is stuck: one statement.
  const since = addDays(new Date(), -7);
  const rows = await db.$queryRaw<{ id: string; name: string; joinCode: string; leagueEnabled: boolean; enrollments: number; pending: number; assignments: number; active: number; stuck: number }[]>`
    SELECT c.id, c.name, c."joinCode", c."leagueEnabled",
      (SELECT count(*) FROM "Enrollment" e WHERE e."classId" = c.id AND e.status = 'APPROVED')::int AS enrollments,
      (SELECT count(*) FROM "Enrollment" e WHERE e."classId" = c.id AND e.status = 'PENDING')::int AS pending,
      (SELECT count(*) FROM "Assignment" a WHERE a."classId" = c.id)::int AS assignments,
      (SELECT count(*) FROM "Enrollment" e JOIN "User" u ON u.id = e."userId" WHERE e."classId" = c.id AND e.status = 'APPROVED' AND u."lastActiveAt" >= ${utc(since)})::int AS active,
      (SELECT count(*) FROM "Enrollment" e WHERE e."classId" = c.id AND e.status = 'APPROVED' AND EXISTS (
        SELECT 1 FROM "PassageAttempt" a JOIN "QuestionAnswer" q ON q."attemptId" = a.id
        WHERE a."userId" = e."userId" AND a."invalidatedAt" IS NULL AND a."completedAt" IS NULL AND q.correct = false AND q.tries >= ${STUCK_TRIES}))::int AS stuck
    FROM "Class" c WHERE c."teacherId" = ${teacher.id} ORDER BY c."createdAt" DESC`;
  const classes = rows.map((c) => ({ ...c, _count: { enrollments: c.enrollments, assignments: c.assignments } }));
  const activity = new Map(rows.map((c) => [c.id, { active: c.active, stuck: c.stuck }]));
  return (
    <>
      <PageHeader
        kicker="Teaching"
        title="Classes"
        subtitle={classes.length ? `${classes.length} class${classes.length === 1 ? "" : "es"}` : undefined}
        action={
          <Link href="/teacher/new" className={`${accentOutline} px-4 py-2 text-sm font-medium`}>
            <Plus size={16} aria-hidden />
            New class
          </Link>
        }
      />
      {classes.length ? (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))]">
          {classes.map((c) => {
            const { active, stuck } = activity.get(c.id)!;
            const students = c._count.enrollments;
            return (
              <Link
                key={c.id}
                href={`/teacher/classes/${c.id}`}
                className="flex flex-col gap-3 rounded-xl bg-surface p-[18px] text-ink no-underline hover:shadow-[0_0_0_1px_var(--color-accent-700)] hover:no-underline"
              >
                <div className="flex items-center gap-2">
                  <UsersThree size={20} className="text-[var(--color-accent-400)]" aria-hidden />
                  <span className="truncate text-[17px] font-medium">{c.name}</span>
                  <ArrowUpRight size={16} className="ml-auto shrink-0 text-[var(--color-accent-400)]" aria-hidden />
                </div>
                <span className="text-[13px] text-soft">
                  {students} student{students === 1 ? "" : "s"} · {active} active this week · {c._count.assignments} homework
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="accent">Code {c.joinCode}</Badge>
                  {c.pending > 0 && <Badge tone="warn">{c.pending} asking to join</Badge>}
                  {stuck > 0 && <Badge tone="bad">{stuck} stuck</Badge>}
                  {!c.leagueEnabled && <Badge>League off</Badge>}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState title="No classes yet">
            <Link href="/teacher/new">Create a class</Link>
          </EmptyState>
        </Card>
      )}
    </>
  );
}

export default function ClassesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClassesContent />
    </Suspense>
  );
}
