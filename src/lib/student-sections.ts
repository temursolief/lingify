import "server-only";
import { cache } from "react";
import { studentSummary } from "./class-overview";
import { db } from "./db";
import { dueToday } from "./decks";

export type Section = { href: string; label: string; subtitle: string; badge?: number; peek: string };

/** A student's four sections with what is waiting in each. Cached for the request: the sidebar and the home page show the same. */
export const studentSections = cache(async (userId: string): Promise<Section[]> => {
  const [assigned, due, summary] = await Promise.all([
    db.assignmentRecipient.count({ where: { studentId: userId, completedAt: null } }),
    dueToday(userId),
    studentSummary(userId),
  ]);
  return [
    {
      href: "/student/passages",
      label: "Passages",
      badge: assigned,
      subtitle: assigned ? `${assigned} from your teacher to do` : summary.band ? `Estimated band ${summary.band}` : "IELTS Academic Reading",
      peek: "Reading",
    },
    { href: "/student/listening", label: "Listening", subtitle: "Video lessons with questions", peek: "Video" },
    { href: "/student/flashcards", label: "Flashcards", badge: due, subtitle: due ? `${due} card${due === 1 ? "" : "s"} due today` : "Anki decks and your own cards", peek: "Anki" },
    {
      href: "/student/progress",
      label: "Progress",
      subtitle: summary.passagesStarted ? `${summary.passagesStarted} passage${summary.passagesStarted === 1 ? "" : "s"} · see your mistakes` : "Your mistakes, explained",
      peek: summary.band ? `Band ${summary.band}` : "Mistakes",
    },
  ];
});
