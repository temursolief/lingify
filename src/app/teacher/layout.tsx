import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { NavLinks } from "@/components/nav-links";
import { SidebarUser } from "@/components/sidebar-user";
import { getSession, isAdmin } from "@/lib/auth";
import { activeStudentCounts } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { STUCK_TRIES } from "@/lib/insights";

/** Each class is a row in the list, like a group chat; then the teacher's passages, decks (admins) and New class. */
async function TeacherNav() {
  const session = await getSession();
  if (!session) return null;
  const [user, classes] = await Promise.all([
    db.user.findUnique({ where: { id: session.userId }, select: { email: true } }),
    db.class.findMany({ where: { teacherId: session.userId }, include: { _count: { select: { enrollments: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const [active, stuck, passages, decks, lessons] = await Promise.all([
    activeStudentCounts(classes.map((c) => c.id)),
    Promise.all(
      classes.map((c) =>
        db.questionAnswer
          .findMany({
            where: { correct: false, tries: { gte: STUCK_TRIES }, attempt: { completedAt: null, user: { enrollments: { some: { classId: c.id } } } } },
            select: { attempt: { select: { userId: true } } },
            distinct: ["attemptId"],
          })
          .then((rows) => new Set(rows.map((r) => r.attempt.userId)).size),
      ),
    ),
    db.passage.count({ where: { ownerId: session.userId } }),
    db.deck.count({ where: { ownerId: null } }),
    db.listeningLesson.count(),
  ]);
  const admin = !!user && isAdmin(user.email);
  return (
    <NavLinks
      items={[
        ...classes.map((c, i) => ({
          href: `/teacher/classes/${c.id}`,
          label: c.name,
          badge: stuck[i],
          subtitle: stuck[i]
            ? `${stuck[i]} student${stuck[i] === 1 ? "" : "s"} stuck`
            : `${c._count.enrollments} student${c._count.enrollments === 1 ? "" : "s"} · ${active[i]} active this week`,
        })),
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
