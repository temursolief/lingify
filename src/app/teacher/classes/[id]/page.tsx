import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBreakdownView } from "@/components/error-breakdown";
import { Card, PageHeader, PageSkeleton, Tabs, cx } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { classOverview, teacherClass } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { errorBreakdown, passageHeatmap, stuckStudents } from "@/lib/insights";
import { formatDay } from "@/lib/time";
import { AssignLessonForm, AssignPassageForm, DeleteAssignmentButton } from "../../teacher-forms";

export const metadata: Metadata = { title: "Class" };

const TABS = [
  { key: "students", label: "Students" },
  { key: "passages", label: "Passages" },
  { key: "listening", label: "Listening" },
  { key: "mistakes", label: "Mistakes" },
];

function ago(d: Date | null) {
  if (!d) return "never";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

async function ClassContent(props: PageProps<"/teacher/classes/[id]">) {
  const teacher = await requireTeacher();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const cls = await teacherClass(id, teacher.id);
  if (!cls) notFound();
  const tab = TABS.some((t) => t.key === sp.tab) ? String(sp.tab) : "students";
  const base = `/teacher/classes/${cls.id}`;
  const [rows, stuck] = await Promise.all([classOverview(cls.id), stuckStudents(cls.id)]);

  return (
    <>
      <PageHeader
        title={cls.name}
        subtitle={<>Join code <b className="text-ink">{cls.joinCode}</b> · {rows.length} student{rows.length === 1 ? "" : "s"}{stuck.length > 0 && <span className="text-bad"> · {stuck.length} stuck</span>}</>}
      />
      <Tabs current={tab} items={TABS.map((t) => ({ ...t, href: t.key === "students" ? base : `${base}?tab=${t.key}` }))} />

      {tab === "students" && (
        <div className="space-y-4">
          {stuck.length > 0 && (
            <Card className="bg-bad-soft">
              <p className="font-semibold text-bad">Stuck students</p>
              <p className="text-sm text-muted">Three or more tries and still red. A quick word in class may help.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {stuck.map((s) => (
                  <li key={`${s.userId}-${s.passageId}`}>
                    <Link href={`${base}/students/${s.userId}`} className="font-medium">{s.name}</Link> · {s.title} · question{s.questions.length > 1 ? "s" : ""} {s.questions.sort((a, b) => a - b).join(", ")}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {rows.length === 0 ? (
            <Card className="py-8 text-center text-muted">No students yet. Share the join code <b className="text-ink">{cls.joinCode}</b>.</Card>
          ) : (
            <div className="overflow-x-auto rounded-xl bg-surface shadow-bubble">
              <table className="w-full min-w-[640px] text-left text-[15px]">
                <thead className="border-b border-line text-sm text-muted">
                  <tr>
                    <th className="px-4 py-2 font-normal">Student</th>
                    <th className="px-3 py-2 text-right font-normal">Passages done</th>
                    <th className="px-3 py-2 text-right font-normal">Band (last 3)</th>
                    <th className="px-3 py-2 text-right font-normal">Flashcards, 7 days</th>
                    <th className="px-3 py-2 text-right font-normal">Streak</th>
                    <th className="px-4 py-2 text-right font-normal">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-hover">
                      <td className="px-4 py-2.5">
                        <Link href={`${base}/students/${r.id}`}>{r.name}</Link>
                        {r.stuck > 0 && <span className="ml-2 text-xs text-bad">stuck</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.passagesDone}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.band ?? "–"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.cardsThisWeek}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.streak}</td>
                      <td className="px-4 py-2.5 text-right text-muted">{ago(r.lastActiveAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "passages" && <PassagesTab classId={cls.id} teacherId={teacher.id} base={base} selected={typeof sp.p === "string" ? sp.p : null} students={rows} />}

      {tab === "listening" && <ListeningTab classId={cls.id} students={rows} />}

      {tab === "mistakes" && (
        <div className="mx-auto max-w-3xl">
          <ErrorBreakdownView data={await errorBreakdown(rows.map((r) => r.id))} who="class" />
        </div>
      )}
    </>
  );
}

async function PassagesTab({ classId, teacherId, base, selected, students }: { classId: string; teacherId: string; base: string; selected: string | null; students: { id: string; name: string }[] }) {
  const [assignments, passages] = await Promise.all([
    db.assignment.findMany({
      where: { classId },
      orderBy: { createdAt: "desc" },
      include: { passage: { select: { id: true, title: true } }, recipients: { select: { completedAt: true } } },
    }),
    db.passage.findMany({ where: { OR: [{ ownerId: null }, { ownerId: teacherId }] }, orderBy: { title: "asc" }, select: { id: true, title: true, ownerId: true } }),
  ]);
  const passageId = selected ?? assignments[0]?.passageId ?? null;
  const heat = passageId ? await passageHeatmap(classId, passageId) : null;
  const title = passages.find((p) => p.id === passageId)?.title;

  return (
    <div className="space-y-4">
      {heat && (
        <Card className="p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
            <p className="font-semibold">{title}: first tries</p>
            <p className="text-sm text-muted">{heat.submitted} of {heat.rows.length} submitted</p>
          </div>
          {heat.submitted === 0 ? (
            <p className="px-4 pt-1 pb-4 text-sm text-muted">Nobody has submitted this passage yet.</p>
          ) : (
            <div className="overflow-x-auto px-4 pt-3 pb-4">
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className="pr-3 text-left font-normal text-muted">Question</th>
                    {heat.questions.map((q) => (
                      <th key={q.number} className="px-0.5 text-center font-medium tabular-nums">{q.number}</th>
                    ))}
                    <th className="pl-3 text-right font-normal text-muted">Score</th>
                  </tr>
                  <tr>
                    <th className="pr-3 text-left text-xs font-normal text-muted">Wrong first try</th>
                    {heat.questions.map((q) => (
                      <th
                        key={q.number}
                        className={cx("px-0.5 text-center text-xs font-semibold tabular-nums", q.share >= 0.6 ? "text-bad" : q.share >= 0.3 ? "text-warn" : "text-muted")}
                        title={`${q.wrong} of ${heat.submitted} wrong on the first try`}
                      >
                        {Math.round(q.share * 100)}%
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {heat.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-0.5 pr-3 whitespace-nowrap">
                        <Link href={`${base}/students/${r.id}?p=${passageId}`}>{r.name}</Link>
                        {r.stuck.length > 0 && <span className="ml-1 text-xs text-bad">stuck on {r.stuck.join(", ")}</span>}
                      </td>
                      {r.cells.map((c, i) => (
                        <td key={i} className="px-0.5 py-0.5">
                          <span
                            className={cx(
                              "block h-6 w-7 rounded-sm text-center text-[11px] leading-6 text-white",
                              !c ? "bg-grid" : c.firstCorrect ? "bg-good" : c.correct ? "bg-[#f0a020]" : "bg-bad",
                            )}
                            title={!c ? "Not submitted" : c.firstCorrect ? "Right first time" : c.correct ? `Corrected after ${c.tries} tries` : `Still wrong after ${c.tries} tries`}
                          >
                            {c && !c.firstCorrect ? c.tries : ""}
                          </span>
                        </td>
                      ))}
                      <td className="pl-3 text-right tabular-nums text-muted">{r.submitted ? `${r.firstCorrect}/${r.total}` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted">
                <span className="text-good">■</span> right first time · <span className="text-[#f0a020]">■</span> corrected (number = tries) · <span className="text-bad">■</span> still wrong.
                Questions most of the class got wrong are the ones to go through in your next lesson.
              </p>
            </div>
          )}
        </Card>
      )}

      <Card className="p-0">
        <p className="px-4 pt-4 font-semibold">Assigned passages</p>
        {assignments.length === 0 ? (
          <p className="px-4 pt-1 pb-4 text-sm text-muted">Nothing assigned yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {assignments.map((a) => {
              const done = a.recipients.filter((r) => r.completedAt).length;
              const late = a.dueAt && a.dueAt < new Date() ? a.recipients.length - done : 0;
              return (
                <li key={a.id} className={cx("flex flex-wrap items-center gap-3 px-4 py-2.5", a.passageId === passageId && "bg-accent-soft")}>
                  <Link href={`${base}?tab=passages&p=${a.passageId}`} className="min-w-0 flex-1 truncate">{a.passage!.title}</Link>
                  <span className="text-sm text-muted">
                    {done}/{a.recipients.length} done
                    {a.dueAt && ` · due ${formatDay(a.dueAt)}`}
                    {late > 0 && <span className="text-bad"> · {late} late</span>}
                  </span>
                  <DeleteAssignmentButton id={a.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Assign a passage</p>
        <AssignPassageForm classId={classId} passages={passages.map((p) => ({ id: p.id, title: p.title, mine: p.ownerId === teacherId }))} students={students} />
      </Card>
    </div>
  );
}

async function ListeningTab({ classId, students }: { classId: string; students: { id: string; name: string }[] }) {
  const [assignments, lessons] = await Promise.all([
    db.assignment.findMany({
      where: { classId, lessonId: { not: null } },
      orderBy: { createdAt: "desc" },
      include: { lesson: { select: { id: true, title: true } }, recipients: { select: { completedAt: true } } },
    }),
    db.listeningLesson.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);

  return (
    <div className="space-y-4">
      <Card className="p-0">
        <p className="px-4 pt-4 font-semibold">Assigned lessons</p>
        {assignments.length === 0 ? (
          <p className="px-4 pt-1 pb-4 text-sm text-muted">Nothing assigned yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {assignments.map((a) => {
              const done = a.recipients.filter((r) => r.completedAt).length;
              const late = a.dueAt && a.dueAt < new Date() ? a.recipients.length - done : 0;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate">{a.lesson!.title}</span>
                  <span className="text-sm text-muted">
                    {done}/{a.recipients.length} done
                    {a.dueAt && ` · due ${formatDay(a.dueAt)}`}
                    {late > 0 && <span className="text-bad"> · {late} late</span>}
                  </span>
                  <DeleteAssignmentButton id={a.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Assign a lesson</p>
        <AssignLessonForm classId={classId} lessons={lessons} students={students} />
      </Card>
    </div>
  );
}

export default function ClassPage(props: PageProps<"/teacher/classes/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClassContent {...props} />
    </Suspense>
  );
}
