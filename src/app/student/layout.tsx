import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { NavLinks } from "@/components/nav-links";
import { OfflineSync } from "@/components/offline-sync";
import { SidebarUser } from "@/components/sidebar-user";
import { getSession } from "@/lib/auth";
import { studentSummary } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { dueToday } from "@/lib/decks";

async function StudentNav() {
  const session = await getSession();
  if (!session) return null;
  const userId = session.userId;
  const [assigned, due, summary] = await Promise.all([
    db.assignmentRecipient.count({ where: { studentId: userId, completedAt: null } }),
    dueToday(userId),
    studentSummary(userId),
  ]);
  return (
    <NavLinks
      items={[
        {
          href: "/student/passages",
          label: "Passages",
          badge: assigned,
          subtitle: assigned ? `${assigned} from your teacher to do` : summary.band ? `Estimated band ${summary.band}` : "IELTS Academic Reading",
        },
        { href: "/student/flashcards", label: "Flashcards", badge: due, subtitle: due ? `${due} card${due === 1 ? "" : "s"} due today` : "Anki decks and your own cards" },
        { href: "/student/progress", label: "Progress", subtitle: summary.passagesStarted ? `${summary.passagesStarted} passage${summary.passagesStarted === 1 ? "" : "s"} · see your mistakes` : "Your mistakes, explained" },
      ]}
    />
  );
}

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      home="/student/passages"
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
