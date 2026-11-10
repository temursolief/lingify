import type { ReactNode } from "react";
import { AppShell, Nav } from "@/components/app-shell";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dueWhere } from "@/lib/vocab";

async function StudentNav() {
  const session = await getSession();
  const due = session ? await db.lemmaState.count({ where: dueWhere(session.userId) }) : 0;
  return (
    <Nav
      items={[
        { href: "/student", label: "Today", exact: true },
        { href: "/student/library", label: "Read", prefixes: ["/student/library", "/student/read", "/student/fluency"] },
        { href: "/student/review", label: "Review", badge: due },
        { href: "/student/ielts", label: "IELTS" },
        { href: "/student/progress", label: "Progress", prefixes: ["/student/progress", "/student/words"] },
      ]}
    />
  );
}

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell home="/student" nav={<StudentNav />} settings="/student/settings">
      {children}
    </AppShell>
  );
}
