import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { db } from "@/lib/db";
import { coverageOf, MIN_COVERAGE, type LemmaCounts } from "@/lib/texts";
import { wordSets } from "@/lib/vocab";
import { DeleteTextButton, TextForm } from "./text-form";

export const metadata: Metadata = { title: "My texts" };

async function TextsContent() {
  const teacher = await requireTeacher();
  const [texts, students] = await Promise.all([
    db.text.findMany({ where: { ownerId: teacher.id }, orderBy: { createdAt: "desc" } }),
    db.enrollment.findMany({ where: { class: { teacherId: teacher.id } }, select: { userId: true }, distinct: ["userId"] }),
  ]);
  const knownSets = await Promise.all(students.map((s) => wordSets(s.userId).then((w) => w.known)));

  return (
    <div className="space-y-6">
      <PageHeader title="My texts" subtitle="Add your own reading texts, for example passages you already use in class. Only your students can see them." />
      <Card>
        <h2 className="mb-1 font-semibold">Your texts</h2>
        {texts.length === 0 ? (
          <EmptyState title="You have not added any texts yet." />
        ) : (
          <table className="w-full text-left">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-normal">Title</th>
                <th className="py-1 text-right font-normal">Words</th>
                <th className="py-1 text-right font-normal">Questions</th>
                <th className="py-1 text-right font-normal">Students who can read it (95%+)</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {texts.map((t) => {
                const readers = knownSets.filter((k) => coverageOf(t.lemmaCounts as LemmaCounts, k).coverage >= MIN_COVERAGE).length;
                return (
                  <tr key={t.id} className="border-t border-line">
                    <td className="py-1.5">{t.title} <span className="text-sm text-muted">· {t.genre}</span></td>
                    <td className="py-1.5 text-right tabular-nums">{t.wordCount}</td>
                    <td className="py-1.5 text-right tabular-nums">{(t.questions as unknown[]).length}</td>
                    <td className={`py-1.5 text-right tabular-nums ${readers === 0 && knownSets.length ? "text-warn" : ""}`}>{readers} of {knownSets.length}</td>
                    <td className="py-1.5 text-right"><DeleteTextButton id={t.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-sm text-muted">If few students can read a text, it is probably too hard for them right now. Simplify rare words or choose an easier text.</p>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Add a text</h2>
        <TextForm />
      </Card>
    </div>
  );
}

export default function TextsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TextsContent />
    </Suspense>
  );
}
