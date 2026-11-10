import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { publicTasks, type IeltsTask } from "@/lib/ielts";
import type { Token } from "@/lib/texts";
import { IeltsTest } from "./ielts-test";

export const metadata: Metadata = { title: "IELTS test" };

async function TestContent(props: PageProps<"/student/ielts/[slug]">) {
  await requireStudent();
  const { slug } = await props.params;
  const text = await db.text.findFirst({ where: { slug, track: "ielts" } });
  if (!text?.ielts) notFound();
  return (
    <IeltsTest
      text={{ id: text.id, slug: text.slug, title: text.title, timeLimit: text.timeLimit ?? 20 }}
      paragraphs={(text.paragraphs as Token[][]).map((p) => p.map((t, i) => (i ? t.s : "") + t.v).join(""))}
      tasks={publicTasks(text.ielts as IeltsTask[])}
    />
  );
}

export default function IeltsTestPage(props: PageProps<"/student/ielts/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TestContent {...props} />
    </Suspense>
  );
}
