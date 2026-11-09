import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Choice, Token } from "@/lib/texts";
import { FluencyRunner } from "./runner";

export const metadata: Metadata = { title: "Speed reading" };

async function RunContent(props: PageProps<"/student/fluency/[slug]">) {
  const user = await requireStudent();
  const { slug } = await props.params;
  const text = await db.text.findUnique({ where: { slug } });
  if (!text) notFound();
  const best = await db.fluencyRun.aggregate({ where: { userId: user.id, gistCorrect: { not: false }, wpm: { lte: 500 } }, _max: { wpm: true } });
  const gist = text.gist as Choice | null;
  return (
    <FluencyRunner
      text={{ id: text.id, title: text.title, wordCount: text.wordCount }}
      paragraphs={(text.paragraphs as Token[][]).map((p) => p.map((t, i) => (i ? t.s : "") + t.v).join(""))}
      gist={gist ? { question: gist.question, options: gist.options } : null}
      target={Math.min(250, Math.round(((best._max.wpm ?? 110) * 1.1) / 5) * 5)}
    />
  );
}

export default function FluencyRunPage(props: PageProps<"/student/fluency/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RunContent {...props} />
    </Suspense>
  );
}
