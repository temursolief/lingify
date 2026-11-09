import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, ButtonLink, Card, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { seriesTitle } from "@/lib/series";
import {
  coverageOf,
  levelFor,
  MIN_COVERAGE,
  type Choice,
  type GrammarPoint,
  type LemmaCounts,
  type Phrase,
  type PreTeachWord,
  type Token,
} from "@/lib/texts";
import { wordSets } from "@/lib/vocab";
import { Reader } from "./reader";

export const metadata: Metadata = { title: "Reading" };

const withoutAnswer = ({ question, options }: Choice) => ({ question, options });

async function ReadPageContent(props: PageProps<"/student/read/[slug]">) {
  const user = await requireStudent();
  const { slug } = await props.params;
  const text = await db.text.findUnique({ where: { slug } });
  if (!text) notFound();

  const [{ known, learning }, readBefore, seriesCount] = await Promise.all([
    wordSets(user.id),
    db.readingSession.count({ where: { userId: user.id, textId: text.id, completedAt: { not: null } } }),
    text.series ? db.text.count({ where: { series: text.series } }) : Promise.resolve(0),
  ]);
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

  const grammar = text.grammar as GrammarPoint[];
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
      learningLemmas={Object.keys(counts).filter((l) => learning.has(l))}
      readBefore={readBefore > 0}
      series={text.series ? { title: seriesTitle(text.series), part: text.seriesPart ?? 1, total: seriesCount } : null}
      lesson={{
        leadIn: text.leadIn,
        prediction: text.prediction ? withoutAnswer(text.prediction as Choice) : null,
        preTeach: (text.preTeach as PreTeachWord[]).map((w) => ({ word: w.word, lemma: w.lemma, definition: w.definition, ccq: withoutAnswer(w.ccq) })),
        gist: text.gist ? (text.gist as Choice).question : null,
        phrases: (text.phrases as Phrase[]).map(({ phrase, meaning, marks }) => ({ phrase, meaning, marks })),
        grammar: readBefore > 0 ? grammar.map((g) => ({ structure: g.structure, marks: g.marks })) : [],
      }}
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
