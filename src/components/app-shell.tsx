import type { ReactNode } from "react";
import { currentUser, getSession } from "@/lib/auth";
import { NavShell, type NavBadges, type NavItem, type NavPerson } from "./nav-shell";
import { OfflineBanner } from "./offline-banner";

const STUDENT_NAV: NavItem[] = [
  { key: "today", label: "Today", href: "/student", icon: "today" },
  { key: "practice", label: "Practice", href: "/student/practice", icon: "practice", also: ["/student/passages", "/student/listening"] },
  { key: "words", label: "Words", href: "/student/flashcards", icon: "words" },
  { key: "journey", label: "Journey", href: "/student/progress", icon: "journey" },
  { key: "class", label: "Class", href: "/student/class", icon: "class" },
];

const TEACHER_NAV: NavItem[] = [
  { key: "today", label: "Today", href: "/teacher", icon: "inbox" },
  { key: "classes", label: "Classes", href: "/teacher/classes", icon: "classes", also: ["/teacher/new"] },
  { key: "library", label: "Library", href: "/teacher/passages", icon: "practice", also: ["/teacher/listening", "/teacher/decks"] },
];

async function person(kicker: (role: string) => string): Promise<NavPerson> {
  const session = await getSession();
  const user = session ? await currentUser(session.userId) : null;
  return { name: user?.name ?? "", kicker: user ? kicker(user.role) : "" };
}

/**
 * The signed-in layout. `badges` resolves after the page starts streaming: the counts in the sidebar never hold up
 * the screen itself.
 */
export function AppShell({
  role,
  badges,
  kicker,
  footer,
  children,
}: {
  role: "student" | "teacher";
  badges: Promise<NavBadges>;
  kicker: (role: string) => string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const student = role === "student";
  return (
    <NavShell
      home={student ? "/student" : "/teacher"}
      items={student ? STUDENT_NAV : TEACHER_NAV}
      settingsHref={student ? "/student/settings" : "/teacher/settings"}
      badges={badges}
      person={person(kicker)}
      footer={footer}
      banner={<OfflineBanner />}
    >
      {children}
    </NavShell>
  );
}
