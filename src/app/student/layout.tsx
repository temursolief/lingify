import type { ReactNode } from "react";
import { AppShell, Nav } from "@/components/app-shell";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

async function StudentNav() {
  const session = await getSession();
  const due = session
    ? await db.lemmaState.count({ where: { userId: session.userId, status: "LEARNING", srsDue: { lte: new Date() } } })
    : 0;
  return (
    <Nav
      items={[
        { href: "/student", label: "Home", exact: true },
        { href: "/student/library", label: "Library" },
        { href: "/student/review", label: "Review", badge: due },
        { href: "/student/words", label: "My words" },
        { href: "/student/fluency", label: "Speed reading" },
        { href: "/student/progress", label: "Progress" },
      ]}
    />
  );
}

async function UserName() {
  const session = await getSession();
  return <span className="hidden p-2 text-nav sm:inline">{session?.name}</span>;
}

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      home="/student"
      nav={<StudentNav />}
      user={<UserName />}
      footer={[
        { href: "/student/library", label: "Library" },
        { href: "/student/fluency", label: "Speed reading" },
        { href: "/student/progress", label: "Progress" },
        { href: "/student/placement", label: "Placement test" },
      ]}
    >
      {children}
    </AppShell>
  );
}
