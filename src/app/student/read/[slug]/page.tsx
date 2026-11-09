import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, ButtonLink, Card, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { coverageOf, levelFor, MIN_COVERAGE, type LemmaCounts, type Token } from "@/lib/texts";
import { wordSets } from "@/lib/vocab";
import { Reader } from "./reader";

export const metadata: Metadata = { title: "Reading" };

async function ReadPageContent(props: PageProps<"/student/read/[slug]">) {
  const user = await requireStudent();
  const { slug } = await props.params;
  const text = await db.text.findUnique({ where: { slug } });
  if (!text) notFound();

  const { known, learning } = await wordSets(user.id);
  const counts = text.lemmaCounts as LemmaCounts;
  const { coverage, unknownLemmas } = coverageOf(counts, known);
  const level = levelFor(coverage);

  if (level === "locked") {
    const tokensTotal = Object.values(counts).reduce((a, b) => a + b, 0);
    const needed = Math.ceil(MIN_COVERAGE * tokensTotal - coverage * tokensTotal);
    return (
      <Card className="mx-auto max-w-xl text-center">
        <Badge tone="warn">Not yet</Badge>
        <h1 className="mt-3 text-xl font-semibold">{text.title} is a little too hard right now</h1>
        <p className="mt-3 text-muted">
          You know {Math.round(coverage * 100)}% of its words. A text opens at {MIN_COVERAGE * 100}%, the point where reading
          really helps you learn. It has {unknownLemmas.length} words you haven&apos;t learned yet; about {needed} more known
          words in this text will open it.
        </p>
        <p className="mt-3 text-sm text-muted">Keep reading and reviewing, and this text will open soon.</p>
        <ButtonLink href="/student/library" className="mt-6">Find a text at your level</ButtonLink>
      </Card>
    );
  }

  const learningInText = Object.keys(counts).filter((l) => learning.has(l));
  return (
    <Reader
      text={{
        id: text.id,
        slug: text.slug,
        title: text.title,
        genre: text.genre,
        wordCount: text.wordCount,
        paragraphs: text.paragraphs as Token[][],
      }}
      coverage={coverage}
      pleasure={level === "pleasure"}
      learningLemmas={learningInText}
    />
  );
}

export default function ReadPage(props: PageProps<"/student/read/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReadPageContent {...props} />
    </Suspense>
  );
}
