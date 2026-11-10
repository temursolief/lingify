import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { NavLinks } from "@/components/nav-links";
import { SidebarUser } from "@/components/sidebar-user";
import { getSession } from "@/lib/auth";
import { activeStudentCounts } from "@/lib/class-overview";
import { db } from "@/lib/db";

/** Each class is a row in the list, like a group chat; "New class" and "My texts" sit under them. */
async function TeacherNav() {
  const session = await getSession();
  if (!session) return null;
  const classes = await db.class.findMany({
    where: { teacherId: session.userId },
    include: { _count: { select: { enrollments: true } } },
    orderBy: { createdAt: "desc" },
  });
  const active = await activeStudentCounts(classes.map((c) => c.id));
  return (
    <NavLinks
      items={[
        ...classes.map((c, i) => ({
          href: `/teacher/classes/${c.id}`,
          label: c.name,
          subtitle: `${c._count.enrollments} student${c._count.enrollments === 1 ? "" : "s"} · ${active[i]} active this week`,
        })),
        { href: "/teacher/new", label: "New class", subtitle: classes.length ? "Create a class and get its code" : "Start here" },
        { href: "/teacher/texts", label: "My texts", subtitle: "Your own reading texts" },
      ]}
    />
  );
}

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell home="/teacher" nav={<TeacherNav />} footer={<SidebarUser href="/teacher/settings" />}>
      {children}
    </AppShell>
  );
}
