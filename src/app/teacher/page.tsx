import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageSkeleton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { db } from "@/lib/db";

/** Teachers land straight in their newest class, like opening the last chat; with no class yet, on "New class". */
async function TeacherHomeContent(): Promise<null> {
  const teacher = await requireTeacher();
  const latest = await db.class.findFirst({ where: { teacherId: teacher.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
  redirect(latest ? `/teacher/classes/${latest.id}` : "/teacher/new");
}

export default function TeacherHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeacherHomeContent />
    </Suspense>
  );
}
