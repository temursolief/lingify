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
      <PageHeader title="New class" subtitle={count ? "Open a class on the left to see your students" : "Create your first class to get started"} />
      <Card className="mx-auto max-w-lg">
        <p className="font-semibold">Create a class</p>
        <p className="mt-1 text-sm text-muted">You get a code. Students enter it after signing up, and the class appears on the left.</p>
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
