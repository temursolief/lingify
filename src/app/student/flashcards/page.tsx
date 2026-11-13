import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { deckSummaries, PERSONAL_DECK, studentDecks } from "@/lib/decks";
import { OPTIONS } from "@/lib/anki";

export const metadata: Metadata = { title: "Flashcards" };

/** AnkiWeb's deck list: each deck with its New (blue), Learn (red) and Due (green) counts. */
async function FlashcardsContent() {
  const user = await requireStudent();
  const decks = await studentDecks(user.id);
  // One pair of counting queries for all decks, whatever their size.
  const summaries = await deckSummaries(user.id, decks.map((d) => d.id));
  const rows = decks.map((deck) => ({ deck, counts: summaries.get(deck.id) ?? { new: 0, learn: 0, due: 0, total: 0 } }));
  return (
    <>
      <PageHeader kicker="Words" title="Words you’ve met in real passages" subtitle={`Anki scheduling · ${OPTIONS.newPerDay} new cards a day · every card returns within ${OPTIONS.maxInterval} days · +2 XP per card when you take your time`} />
      <div className="max-w-2xl">
        <div className="overflow-hidden rounded-xl bg-surface shadow-bubble">
          <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_3rem] sm:grid-cols-[minmax(0,1fr)_4rem_4rem_4rem] gap-2 border-b border-line px-4 py-2 text-sm text-muted">
            <span>Deck</span>
            <span className="text-right">New</span>
            <span className="text-right">Learn</span>
            <span className="text-right">Due</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map(({ deck, counts }) => (
              <li key={deck.id}>
                <Link
                  href={`/student/flashcards/${deck.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_3rem] sm:grid-cols-[minmax(0,1fr)_4rem_4rem_4rem] items-center gap-2 px-4 py-3 text-ink no-underline hover:bg-hover hover:no-underline"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{deck.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {deck.name === PERSONAL_DECK
                        ? "Your own highlighted phrases"
                        : deck.passageId
                          ? "From this passage, plus your own highlights in it"
                          : deck.lessonId
                            ? "This lesson's key words"
                            : "From your school"}{" "}
                      · {counts.total} card{counts.total === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className={`text-right tabular-nums ${counts.new ? "text-accent" : "text-muted/50"}`}>{counts.new}</span>
                  <span className={`text-right tabular-nums ${counts.learn ? "text-bad" : "text-muted/50"}`}>{counts.learn}</span>
                  <span className={`text-right tabular-nums ${counts.due ? "text-good" : "text-muted/50"}`}>{counts.due}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 px-1 text-xs text-faint">
          Make your own cards by highlighting a phrase in any passage. The sentence becomes the front, with the phrase blanked out.
        </p>
      </div>
    </>
  );
}

export default function FlashcardsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FlashcardsContent />
    </Suspense>
  );
}
