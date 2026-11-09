import type { ReactNode } from "react";
import { AppShell, Nav } from "@/components/app-shell";
import { getSession } from "@/lib/auth";

async function UserName() {
  const session = await getSession();
  return <span className="hidden font-medium sm:inline">{session?.name}</span>;
}

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell home="/teacher" nav={<Nav items={[{ href: "/teacher", label: "My classes" }]} />} user={<UserName />}>
      {children}
    </AppShell>
  );
}
