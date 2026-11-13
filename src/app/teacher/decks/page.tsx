import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { OPTIONS } from "@/lib/anki";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDay } from "@/lib/time";
import { LibraryTabs } from "../library-tabs";
import { DeleteDeckButton, UploadDeckForm } from "../teacher-forms";

export const metadata: Metadata = { title: "Anki decks" };

async function DecksContent() {
  await requireAdmin();
  const decks = await db.deck.findMany({
    where: { ownerId: null, passageId: null, lessonId: null, archivedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { cards: true, media: true } } },
  });
  return (
    <>
      <PageHeader kicker="Library" title="Anki decks" subtitle="Decks uploaded here appear for every student" />
      <LibraryTabs current="decks" />
      <div className="max-w-3xl space-y-4">
        <Card>
          <p className="font-semibold">Upload a deck</p>
          <p className="mt-1 mb-3 text-sm text-muted">
            In Anki desktop: File → Export → “Anki Deck Package (.apkg)”, with media included. Students study it with Anki&apos;s scheduling,
            except that no card waits longer than {OPTIONS.maxInterval} days.
          </p>
          <UploadDeckForm />
        </Card>
        {decks.length > 0 && (
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {decks.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.name}</span>
                    <span className="block text-sm text-muted">{d._count.cards} cards{d._count.media ? ` · ${d._count.media} images and sounds` : ""} · uploaded {formatDay(d.createdAt)}</span>
                  </span>
                  <DeleteDeckButton id={d.id} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

export default function DecksPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DecksContent />
    </Suspense>
  );
}
