import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Plus, UsersThree } from "@/components/icons";
import { accentOutline, Badge, Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { classActivity } from "@/lib/class-overview";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Classes" };

/** One card per class, newest first, with how many are active and who is stuck. */
async function ClassesContent() {
  const teacher = await requireTeacher();
  const classes = await db.class.findMany({
    where: { teacherId: teacher.id },
    select: { id: true, name: true, joinCode: true, leagueEnabled: true, _count: { select: { enrollments: true, assignments: true } } },
    orderBy: { createdAt: "desc" },
  });
  const activity = await classActivity(classes.map((c) => c.id));
  return (
    <>
      <PageHeader
        kicker="Teaching"
        title="Classes"
        subtitle={classes.length ? `${classes.length} class${classes.length === 1 ? "" : "es"}` : "Create your first class: students join it with a code"}
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
            <Link href="/teacher/new">Create a class</Link> and share its join code with your students.
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
