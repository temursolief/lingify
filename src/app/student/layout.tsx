import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import type { NavBadges } from "@/components/nav-shell";
import { OfflineSync } from "@/components/offline-sync";
import { getSession } from "@/lib/auth";
import { dueToday } from "@/lib/decks";
import { studentHomework } from "@/lib/today";

/** Counts on the tabs: homework still open (Today) and flashcards due (Words). */
async function badges(): Promise<NavBadges> {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") return {};
  const [homework, due] = await Promise.all([studentHomework(session.userId), dueToday(session.userId)]);
  return { today: homework.filter((h) => h.state !== "done").length, words: due };
}

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      role="student"
      badges={badges()}
      kicker={() => "Student · IELTS"}
      // Keeps the offline copy fresh on every page; its one line of status sits at the foot of the sidebar.
      footer={<OfflineSync />}
    >
      {children}
    </AppShell>
  );
}
