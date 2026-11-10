import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { db } from "@/lib/db";
import type { QuestionGroup } from "@/lib/passage-format";
import { DeletePassageButton, UploadPassageForm } from "../teacher-forms";

export const metadata: Metadata = { title: "My passages" };

async function PassagesContent() {
  const teacher = await requireTeacher();
  const passages = await db.passage.findMany({
    where: { ownerId: teacher.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { assignments: true, attempts: true } } },
  });
  return (
    <>
      <PageHeader title="My passages" subtitle="Upload IELTS passages as JSON, then assign them from a class" action={<Link href="/teacher/passages/format" className="text-sm">Format guide</Link>} />
      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <p className="font-semibold">Upload a passage</p>
          <p className="mt-1 mb-3 text-sm text-muted">
            The file must follow the <Link href="/teacher/passages/format">passage format</Link>. Start from the{" "}
            <a href="/samples/passage-example.json" download>example file</a>. Mistakes are listed so you can fix them.
          </p>
          <UploadPassageForm />
        </Card>
        {passages.length > 0 && (
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {passages.map((p) => {
                const questions = (p.groups as QuestionGroup[]).reduce((n, g) => n + g.questions.length, 0);
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.title}</span>
                      <span className="block text-sm text-muted">
                        {p.paragraphs.length} paragraphs · {questions} questions · {p.timeLimit} min · assigned {p._count.assignments}× · {p._count.attempts} attempts
                      </span>
                    </span>
                    <DeletePassageButton id={p.id} />
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

export default function TeacherPassagesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PassagesContent />
    </Suspense>
  );
}
