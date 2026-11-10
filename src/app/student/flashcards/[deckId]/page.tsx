import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { canUseDeck, deckSummary, nextCard } from "@/lib/decks";
import { StudySession } from "./study-session";

export const metadata: Metadata = { title: "Study" };

async function StudyContent(props: PageProps<"/student/flashcards/[deckId]">) {
  const user = await requireStudent();
  const { deckId } = await props.params;
  if (!(await canUseDeck(user.id, deckId))) notFound();
  const [deck, card, counts] = await Promise.all([
    db.deck.findUniqueOrThrow({ where: { id: deckId }, select: { id: true, name: true, css: true } }),
    nextCard(user.id, deckId),
    deckSummary(user.id, deckId),
  ]);
  return <StudySession deck={{ id: deck.id, name: deck.name, css: deck.css as Record<string, string> }} first={card} counts={counts} />;
}

export default function StudyPage(props: PageProps<"/student/flashcards/[deckId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudyContent {...props} />
    </Suspense>
  );
}
