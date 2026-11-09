import { Suspense } from "react";
import type { Metadata } from "next";
import { ButtonLink, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { reviewQueue } from "@/lib/review-queue";
import { ReviewSession } from "./review-session";

export const metadata: Metadata = { title: "Review" };

async function ReviewPageContent() {
  const user = await requireStudent();
  const { cards, mode, totalDue } = await reviewQueue(user.id);

  if (!cards.length) {
    const nextDue = await db.lemmaState.findFirst({
      where: { userId: user.id, status: "LEARNING", srsDue: { not: null } },
      orderBy: { srsDue: "asc" },
      select: { srsDue: true },
    });
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Review" subtitle="Words come back here just before you would forget them." />
        <EmptyState title="Nothing to review right now">
          {nextDue?.srsDue ? (
            <p>Your next word is due {nextDue.srsDue.toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" })}.</p>
          ) : (
            <p>Tap words while you read to add them here.</p>
          )}
          <ButtonLink href="/student/library" className="mt-4">Read something</ButtonLink>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Review"
        subtitle={`${totalDue} word${totalDue === 1 ? "" : "s"} due. ${mode === "typed" ? "You're doing great, so type each word from memory." : "Choose the missing word."}`}
      />
      <ReviewSession cards={cards} mode={mode} />
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReviewPageContent />
    </Suspense>
  );
}
