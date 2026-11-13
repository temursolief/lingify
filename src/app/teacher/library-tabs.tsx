import { Tabs } from "@/components/ui";
import { currentUser, getSession, isAdmin } from "@/lib/auth";

/** Passages for every teacher; listening lessons and school-wide Anki decks for admin teachers only. */
export async function LibraryTabs({ current }: { current: "passages" | "listening" | "decks" }) {
  const session = await getSession();
  const user = session ? await currentUser(session.userId) : null;
  if (!user || !isAdmin(user.email)) return null;
  return (
    <Tabs
      current={current}
      items={[
        { key: "passages", label: "Passages", href: "/teacher/passages" },
        { key: "listening", label: "Listening lessons", href: "/teacher/listening" },
        { key: "decks", label: "Anki decks", href: "/teacher/decks" },
      ]}
    />
  );
}
