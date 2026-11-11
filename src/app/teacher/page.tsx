import { Suspense } from "react";
import type { Metadata } from "next";
import { Folder, FolderGrid, FoldersSkeleton, NewFolder } from "@/components/folder";
import { PageHeader } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { classActivity } from "@/lib/class-overview";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Classes" };

const COLORS = ["var(--series-1)", "var(--series-3)", "var(--series-2)", "var(--series-5)", "var(--series-4)", "var(--series-6)"];

/** One folder per class, newest first, with who is stuck; the last folder makes a new class. */
async function TeacherHomeContent() {
  const teacher = await requireTeacher();
  const classes = await db.class.findMany({
    where: { teacherId: teacher.id },
    select: { id: true, name: true, _count: { select: { enrollments: true } } },
    orderBy: { createdAt: "desc" },
  });
  const activity = await classActivity(classes.map((c) => c.id));
  return (
    <>
      <PageHeader
        title="Classes"
        subtitle={classes.length ? `${classes.length} class${classes.length === 1 ? "" : "es"}` : "Create your first class: students join it with a code"}
      />
      <FolderGrid>
        {classes.map((c, i) => {
          const { active, stuck } = activity.get(c.id)!;
          const students = c._count.enrollments;
          return (
            <Folder
              key={c.id}
              href={`/teacher/classes/${c.id}`}
              label={c.name}
              color={COLORS[i % COLORS.length]}
              badge={stuck}
              subtitle={stuck ? `${stuck} stuck` : `${students} student${students === 1 ? "" : "s"}`}
              peek={`${active} active this week`}
            />
          );
        })}
        <NewFolder href="/teacher/new" label="New class" />
      </FolderGrid>
    </>
  );
}

export default function TeacherHome() {
  return (
    <Suspense fallback={<FoldersSkeleton />}>
      <TeacherHomeContent />
    </Suspense>
  );
}
