import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { answerKey, publicGroups, type QuestionGroup } from "@/lib/passage-format";
import { latestAttempt, passageVisibleTo, viewOf } from "@/lib/passages";
import { PassagePractice } from "./passage-practice";

export const metadata: Metadata = { title: "Passage" };

async function PassageContent(props: PageProps<"/student/passages/[slug]">) {
  const user = await requireStudent();
  const { slug } = await props.params;
  const passage = await db.passage.findFirst({ where: { slug, ...passageVisibleTo(user.id) } });
  if (!passage) notFound();
  const groups = passage.groups as QuestionGroup[];
  const attempt =
    (await latestAttempt(user.id, passage.id)) ??
    (await db.passageAttempt.create({ data: { userId: user.id, passageId: passage.id, total: answerKey(groups).length }, include: { answers: true } }));

  return (
    <PassagePractice
      passage={{ id: passage.id, title: passage.title, timeLimit: passage.timeLimit, paragraphs: passage.paragraphs }}
      groups={publicGroups(groups)}
      initial={viewOf(attempt, groups)}
    />
  );
}

export default function PassagePage(props: PageProps<"/student/passages/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PassageContent {...props} />
    </Suspense>
  );
}
