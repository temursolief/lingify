import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { NavLinks } from "@/components/nav-links";
import { NewMenu, type NewMenuItem } from "@/components/new-menu";
import { SidebarUser } from "@/components/sidebar-user";
import { currentUser, getSession, isAdmin } from "@/lib/auth";
import { classActivity } from "@/lib/class-overview";
import { db } from "@/lib/db";

/** Each class is a row in the list, like a group chat. Everything a teacher adds goes through the "+" (TeacherNewMenu). */
async function TeacherNav() {
  const session = await getSession();
  if (!session) return null;
  const classes = await db.class.findMany({
    where: { teacherId: session.userId },
    select: { id: true, name: true, _count: { select: { enrollments: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!classes.length) return <p className="px-5 py-3 text-sm text-muted">No classes yet. Press + to create one.</p>;
  const activity = await classActivity(classes.map((c) => c.id));
  return (
    <NavLinks
      items={classes.map((c) => {
        const { active, stuck } = activity.get(c.id)!;
        return {
          href: `/teacher/classes/${c.id}`,
          label: c.name,
          badge: stuck,
          subtitle: stuck
            ? `${stuck} student${stuck === 1 ? "" : "s"} stuck`
            : `${c._count.enrollments} student${c._count.enrollments === 1 ? "" : "s"} · ${active} active this week`,
        };
      })}
    />
  );
}

/** The "+" next to the app name. Listening lessons and Anki decks are for every student, so only admins add them. */
async function TeacherNewMenu() {
  const session = await getSession();
  if (!session) return null;
  const user = await currentUser(session.userId);
  const admin = !!user && isAdmin(user.email);
  const items: NewMenuItem[] = [
    { href: "/teacher/passages", label: "Passages", hint: "Upload JSON files", icon: "passage" },
    ...(admin
      ? [
          { href: "/teacher/listening", label: "Listening lessons", hint: "Video lessons, JSON", icon: "listening" as const },
          { href: "/teacher/decks", label: "Anki decks", hint: ".apkg for all students", icon: "deck" as const },
        ]
      : []),
    { href: "/teacher/new", label: "New class", hint: "Students join with a code", icon: "class" },
  ];
  return <NewMenu items={items} />;
}

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell home="/teacher" nav={<TeacherNav />} action={<TeacherNewMenu />} footer={<SidebarUser href="/teacher/settings" />}>
      {children}
    </AppShell>
  );
}
