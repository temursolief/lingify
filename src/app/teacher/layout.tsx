import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import type { NavBadges } from "@/components/nav-shell";
import { getSession } from "@/lib/auth";
import { teacherToday } from "@/lib/teacher-today";

/** The count on Today: things that need the teacher. */
async function badges(): Promise<NavBadges> {
  const session = await getSession();
  if (!session || session.role !== "TEACHER") return {};
  return { today: (await teacherToday(session.userId)).items.length };
}

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell role="teacher" badges={badges()} kicker={() => "Teacher"}>
      {children}
    </AppShell>
  );
}
