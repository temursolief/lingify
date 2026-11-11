import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { NavLinks } from "@/components/nav-links";
import { OfflineSync } from "@/components/offline-sync";
import { SidebarUser } from "@/components/sidebar-user";
import { getSession } from "@/lib/auth";
import { studentSections } from "@/lib/student-sections";

/** The same four sections as the folders on the home page, as rows. */
async function StudentNav() {
  const session = await getSession();
  if (!session) return null;
  return <NavLinks items={await studentSections(session.userId)} />;
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
