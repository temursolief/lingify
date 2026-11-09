import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { activeStudentCounts } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { CreateClassForm } from "./teacher-forms";

export const metadata: Metadata = { title: "My classes" };

async function TeacherHomeContent() {
  const teacher = await requireTeacher();
  const classes = await db.class.findMany({
    where: { teacherId: teacher.id },
    include: { _count: { select: { enrollments: true, assignments: true } } },
    orderBy: { createdAt: "desc" },
  });
  const activeCounts = await activeStudentCounts(classes.map((c) => c.id));

  return (
    <div>
      <PageHeader title="My classes" subtitle="Students join with the class code. Open a class to see each student's progress." />
      {classes.length === 0 ? (
        <EmptyState title="No classes yet">Create your first class below and share its code with your students.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((c, i) => (
            <Link key={c.id} href={`/teacher/classes/${c.id}`} className="rounded-xl border border-line bg-surface p-5 transition hover:border-muted">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{c.name}</h2>
                <Badge tone="accent">Code {c.joinCode}</Badge>
              </div>
              <p className="mt-3 text-sm text-muted">
                {c._count.enrollments} student{c._count.enrollments === 1 ? "" : "s"} · {activeCounts[i]} active this week · {c._count.assignments} assignment{c._count.assignments === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      )}
      <Card className="mt-8 max-w-lg">
        <h2 className="font-semibold">Create a class</h2>
        <CreateClassForm />
      </Card>
    </div>
  );
}

export default function TeacherHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeacherHomeContent />
    </Suspense>
  );
}
