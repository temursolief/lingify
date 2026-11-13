import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateClassForm } from "../teacher-forms";

export const metadata: Metadata = { title: "New class" };

/** Classes live in the list on the left; this page only creates a new one. */
async function TeacherHomeContent() {
  const teacher = await requireTeacher();
  const count = await db.class.count({ where: { teacherId: teacher.id } });
  return (
    <>
      <PageHeader kicker="Classes" title="New class" subtitle={count ? `You teach ${count} class${count === 1 ? "" : "es"} already` : "Create your first class to get started"} />
      <Card className="max-w-lg">
        <p className="font-medium">Create a class</p>
        <p className="mt-1 text-sm text-muted">You get a code. Students enter it after signing up, and the class appears under Classes.</p>
        <CreateClassForm />
      </Card>
    </>
  );
}

export default function TeacherHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeacherHomeContent />
    </Suspense>
  );
}
