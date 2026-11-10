import { Suspense } from "react";
import type { Metadata } from "next";
import { ButtonLink, Card, PageHeader, PageSkeleton } from "@/components/ui";
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
      <>
        <PageHeader title="Review" subtitle="Words come back just before you would forget them" />
        <Card className="mx-auto max-w-xl py-8 text-center">
          <p className="font-medium">Nothing to review right now</p>
          <p className="mt-1 text-muted">
            {nextDue?.srsDue
              ? `Your next word is due ${nextDue.srsDue.toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" })}.`
              : "Click words while you read to add them here."}
          </p>
          <ButtonLink href="/student/library" className="mt-5">Read something</ButtonLink>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Review"
        subtitle={`${totalDue} word${totalDue === 1 ? "" : "s"} due · ${mode === "typed" ? "type each word from memory" : "choose the missing word"}`}
      />
      <ReviewSession cards={cards} mode={mode} />
    </>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReviewPageContent />
    </Suspense>
  );
}
