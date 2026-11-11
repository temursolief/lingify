import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { NewMenu, type NewMenuItem } from "@/components/new-menu";
import { currentUser, getSession, isAdmin } from "@/lib/auth";

/** The "+" in the top bar: everything a teacher adds. Listening lessons and Anki decks are for every student, so only admins add them. */
async function TeacherNewMenu() {
  const session = await getSession();
  if (!session) return null;
  const user = await currentUser(session.userId);
  const admin = !!user && isAdmin(user.email);
  const items: NewMenuItem[] = [
    { href: "/teacher/passages", label: "Passages", hint: "Upload JSON files", icon: "passage" },
    ...(admin
      ? [
          { href: "/teacher/listening", label: "Listening lessons", hint: "Video lessons, JSON", icon: "listening" as const },
          { href: "/teacher/decks", label: "Anki decks", hint: ".apkg for all students", icon: "deck" as const },
        ]
      : []),
    { href: "/teacher/new", label: "New class", hint: "Students join with a code", icon: "class" },
  ];
  return <NewMenu items={items} />;
}

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      home="/teacher"
      settings="/teacher/settings"
      end={
        <Suspense fallback={<div className="h-9 w-9" />}>
          <TeacherNewMenu />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
