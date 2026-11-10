import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { NavLinks } from "@/components/nav-links";
import { OfflineSync } from "@/components/offline-sync";
import { SidebarUser } from "@/components/sidebar-user";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dueWhere } from "@/lib/vocab";

async function StudentNav() {
  const session = await getSession();
  if (!session) return null;
  const userId = session.userId;
  const [due, assigned, ielts, fluency, known] = await Promise.all([
    db.lemmaState.count({ where: dueWhere(userId) }),
    db.assignmentRecipient.findFirst({
      where: { studentId: userId, completedAt: null, assignment: { kind: "TEXT" } },
      orderBy: { assignment: { dueAt: { sort: "asc", nulls: "last" } } },
      select: { assignment: { select: { text: { select: { title: true } } } } },
    }),
    db.ieltsAttempt.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 3, select: { band: true } }),
    db.fluencyRun.aggregate({ where: { userId, wpm: { lte: 500 }, OR: [{ gistCorrect: null }, { gistCorrect: true }] }, _max: { wpm: true } }),
    db.lemmaState.count({ where: { userId, status: "KNOWN" } }),
  ]);
  const band = ielts.length ? Math.round((ielts.reduce((n, a) => n + a.band, 0) / ielts.length) * 2) / 2 : null;
  const best = fluency._max.wpm;
  const assignedTitle = assigned?.assignment.text?.title;

  return (
    <NavLinks
      items={[
        { href: "/student", label: "Today", exact: true, subtitle: "Your plan for today" },
        {
          href: "/student/library",
          label: "Read",
          prefixes: ["/student/library", "/student/read"],
          subtitle: assignedTitle ? `From your teacher: ${assignedTitle}` : "Texts at your level",
        },
        { href: "/student/review", label: "Review", badge: due, subtitle: due ? `${due} word${due === 1 ? "" : "s"} waiting for you` : "Nothing to review now" },
        { href: "/student/ielts", label: "IELTS", subtitle: band ? `Estimated band ${band}` : "Timed reading passages" },
        { href: "/student/fluency", label: "Speed reading", subtitle: best ? `Best: ${Math.round(best)} words a minute` : "Read faster with easy texts" },
        { href: "/student/progress", label: "Progress", prefixes: ["/student/progress", "/student/words"], subtitle: `${known.toLocaleString()} words known` },
      ]}
    />
  );
}

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      home="/student"
      nav={<StudentNav />}
      footer={
        <>
          <SidebarUser href="/student/settings" />
          <OfflineSync />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
