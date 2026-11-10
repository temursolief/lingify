import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { studyQueue, usableDeck } from "@/lib/decks";
import { OnlineStudy } from "./online-study";

export const metadata: Metadata = { title: "Study" };

/** Sends today's cards for the deck once; the browser then runs the session and reports each answer. */
async function StudyContent(props: PageProps<"/student/flashcards/[deckId]">) {
  const user = await requireStudent();
  const { deckId } = await props.params;
  const now = new Date();
  const [deck, queue] = await Promise.all([usableDeck(user.id, deckId), studyQueue(user.id, deckId, now)]);
  if (!deck) notFound();
  const startedAt = now.toISOString();
  // A new key for each visit: the session starts from what the server knows now, not from a kept earlier state.
  return <OnlineStudy key={startedAt} deck={{ id: deck.id, name: deck.name, css: deck.css as Record<string, string> }} queue={queue} startedAt={startedAt} />;
}

export default function StudyPage(props: PageProps<"/student/flashcards/[deckId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudyContent {...props} />
    </Suspense>
  );
}
