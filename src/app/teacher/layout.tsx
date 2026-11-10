import type { ReactNode } from "react";
import { AppShell, Nav } from "@/components/app-shell";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      home="/teacher"
      nav={<Nav items={[{ href: "/teacher", label: "Classes", prefixes: ["/teacher/classes"] }, { href: "/teacher/texts", label: "My texts" }]} />}
      settings="/teacher/settings"
    >
      {children}
    </AppShell>
  );
}
