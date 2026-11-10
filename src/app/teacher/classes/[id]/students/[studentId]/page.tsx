import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBreakdownView } from "@/components/error-breakdown";
import { Card, PageHeader, PageSkeleton, Tabs, cx } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { studentSummary, teacherClass } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { errorBreakdown } from "@/lib/insights";
import { paragraphLetter } from "@/lib/passage-format";
import { ERROR_TAG_LABEL, type Evidence } from "@/lib/passages";
import { RemoveStudentButton } from "../../../../teacher-forms";

export const metadata: Metadata = { title: "Student" };

type History = { answer: string; correct: boolean; evidence: Evidence | null; at: string }[];

async function StudentContent(props: PageProps<"/teacher/classes/[id]/students/[studentId]">) {
  const teacher = await requireTeacher();
  const { id, studentId } = await props.params;
  const sp = await props.searchParams;
  const cls = await teacherClass(id, teacher.id);
  if (!cls) notFound();
  const enrollment = await db.enrollment.findUnique({ where: { userId_classId: { userId: studentId, classId: cls.id } }, include: { user: true } });
  if (!enrollment) notFound();
  const student = enrollment.user;

  const [summary, breakdown, attempts] = await Promise.all([
    studentSummary(student.id),
    errorBreakdown([student.id]),
    db.passageAttempt.findMany({
      where: { userId: student.id, firstSubmittedAt: { not: null } },
      orderBy: { firstSubmittedAt: "desc" },
      include: { passage: { select: { id: true, title: true } }, answers: { orderBy: { number: "asc" } } },
    }),
  ]);
  const base = `/teacher/classes/${cls.id}/students/${student.id}`;
  const tab = sp.tab === "mistakes" ? "mistakes" : "work";
  const openId = typeof sp.p === "string" ? attempts.find((a) => a.passageId === sp.p)?.id : attempts[0]?.id;

  return (
    <>
      <PageHeader
        title={student.name}
        subtitle={`${summary.band ? `Band ${summary.band}` : "No band yet"} · ${summary.passagesDone} passages done · ${summary.cardsThisWeek} flashcards this week`}
        action={<RemoveStudentButton classId={cls.id} studentId={student.id} name={student.name} />}
      />
      <Tabs
        current={tab}
        items={[
          { key: "work", label: "Passages", href: base },
          { key: "mistakes", label: "Mistakes", href: `${base}?tab=mistakes` },
        ]}
      />
      <div className="mb-4 text-sm"><Link href={`/teacher/classes/${cls.id}`}>← {cls.name}</Link></div>

      {tab === "mistakes" ? (
        <div className="mx-auto max-w-3xl"><ErrorBreakdownView data={breakdown} who="you" /></div>
      ) : attempts.length === 0 ? (
        <Card className="py-8 text-center text-muted">No passages submitted yet.</Card>
      ) : (
        <div className="mx-auto max-w-4xl space-y-3">
          {attempts.map((a) => (
            <details key={a.id} open={a.id === openId} className="rounded-xl bg-surface shadow-bubble">
              <summary className="flex cursor-pointer items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate font-medium">{a.passage.title}</span>
                <span className="text-sm text-muted tabular-nums">
                  first try {a.firstCorrect}/{a.total} · band {a.band} · {a.completedAt ? <span className="text-good">all corrected</span> : <span className="text-bad">{a.answers.filter((q) => !q.correct).length} still red</span>}
                </span>
              </summary>
              <table className="mx-4 mb-4 w-[calc(100%-2rem)] text-left text-sm">
                <thead className="border-b border-line text-muted">
                  <tr>
                    <th className="py-1.5 pr-2 font-normal">Q</th>
                    <th className="py-1.5 pr-2 font-normal">Tries</th>
                    <th className="py-1.5 pr-2 font-normal">Answers given</th>
                    <th className="py-1.5 pr-2 font-normal">Where they looked</th>
                    <th className="py-1.5 font-normal">Why missed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line align-top">
                  {a.answers.map((q) => {
                    const history = q.history as History;
                    const ev = q.evidence as Evidence | null;
                    return (
                      <tr key={q.number}>
                        <td className="py-1.5 pr-2">
                          <span className={cx("inline-block w-7 rounded-sm text-center text-xs leading-5 text-white", q.firstCorrect ? "bg-good" : q.correct ? "bg-[#f0a020]" : "bg-bad")}>{q.number}</span>
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums">{q.tries}</td>
                        <td className="py-1.5 pr-2">
                          {history.map((h, i) => (
                            <span key={i} className={cx("mr-1.5", h.correct ? "text-good" : "text-bad line-through")}>{h.answer || "—"}</span>
                          ))}
                        </td>
                        <td className="max-w-xs py-1.5 pr-2">
                          {ev ? (
                            <>
                              <span className={cx("mr-1 font-medium", q.evidenceOk === false ? "text-bad" : q.evidenceOk ? "text-good" : "text-muted")}>
                                {paragraphLetter(ev.paragraph)}
                                {q.evidenceOk === false && " (wrong paragraph)"}
                              </span>
                              <span className="font-serif text-muted italic">“{ev.text.length > 90 ? `${ev.text.slice(0, 90)}…` : ev.text}”</span>
                            </>
                          ) : (
                            <span className="text-muted">–</span>
                          )}
                        </td>
                        <td className="py-1.5">{q.errorTag ? ERROR_TAG_LABEL[q.errorTag].title : <span className="text-muted">–</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

export default function StudentPage(props: PageProps<"/teacher/classes/[id]/students/[studentId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentContent {...props} />
    </Suspense>
  );
}
