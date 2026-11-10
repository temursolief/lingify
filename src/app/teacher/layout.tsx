import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { NavLinks } from "@/components/nav-links";
import { SidebarUser } from "@/components/sidebar-user";
import { currentUser, getSession, isAdmin } from "@/lib/auth";
import { classActivity } from "@/lib/class-overview";
import { db } from "@/lib/db";

/** Each class is a row in the list, like a group chat; then the teacher's passages, decks (admins) and New class. */
async function TeacherNav() {
  const session = await getSession();
  if (!session) return null;
  const [user, classes] = await Promise.all([
    currentUser(session.userId),
    db.class.findMany({ where: { teacherId: session.userId }, select: { id: true, name: true, _count: { select: { enrollments: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const [activity, passages, decks, lessons] = await Promise.all([
    classActivity(classes.map((c) => c.id)),
    db.passage.count({ where: { ownerId: session.userId } }),
    db.deck.count({ where: { ownerId: null } }),
    db.listeningLesson.count(),
  ]);
  const admin = !!user && isAdmin(user.email);
  return (
    <NavLinks
      items={[
        ...classes.map((c) => {
          const { active, stuck } = activity.get(c.id)!;
          return {
            href: `/teacher/classes/${c.id}`,
            label: c.name,
            badge: stuck,
            subtitle: stuck
              ? `${stuck} student${stuck === 1 ? "" : "s"} stuck`
              : `${c._count.enrollments} student${c._count.enrollments === 1 ? "" : "s"} · ${active} active this week`,
          };
        }),
        { href: "/teacher/passages", label: "My passages", subtitle: passages ? `${passages} uploaded` : "Upload passages as JSON" },
        ...(admin ? [{ href: "/teacher/listening", label: "Listening", subtitle: lessons ? `${lessons} video lesson${lessons === 1 ? "" : "s"}` : "Upload video lessons as JSON" }] : []),
        ...(admin ? [{ href: "/teacher/decks", label: "Anki decks", subtitle: decks ? `${decks} deck${decks === 1 ? "" : "s"} for all students` : "Upload an .apkg for everyone" }] : []),
        { href: "/teacher/new", label: "New class", subtitle: classes.length ? "Create a class and get its code" : "Start here" },
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
