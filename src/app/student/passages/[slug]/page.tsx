import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { answerKey, publicGroups, type QuestionGroup } from "@/lib/passage-format";
import { proctoringFor } from "@/lib/assignments";
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

  const policy = await proctoringFor(user.id, { passageId: passage.id });
  // The questions are sent only once the test has started: before that, the gate is all there is to see.
  const started = !!attempt.testStartedAt || !!attempt.firstSubmittedAt;

  return (
    <PassagePractice
      passage={{ id: passage.id, title: passage.title, timeLimit: passage.timeLimit, paragraphs: passage.paragraphs }}
      groups={started ? publicGroups(groups) : null}
      initial={viewOf(attempt, groups)}
      policy={policy}
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
