import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { CreateClassForm } from "../teacher-forms";

export const metadata: Metadata = { title: "New class" };

/** Classes live in the list on the left; this page only creates a new one. */
async function TeacherHomeContent() {
  await requireTeacher();
  return (
    <>
      <PageHeader kicker="Classes" title="New class" />
      <Card className="max-w-lg">
        <p className="font-medium">Create a class</p>
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
