import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader, PageSkeleton, Tabs } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { classOverview, teacherClass } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { GOAL_LABEL } from "@/lib/stats";
import { AssignGoalForm, AssignTextForm, DailyMinutesForm, DeleteAssignmentButton } from "../../teacher-forms";
import { planHistory } from "@/lib/daily-plan";

export const metadata: Metadata = { title: "Class" };

const TABS = [
  { key: "students", label: "Students" },
  { key: "plan", label: "Daily plan" },
  { key: "assign", label: "Assignments" },
  { key: "skills", label: "Reading skills" },
];

function ago(date: Date | null) {
  if (!date) return "never";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

async function ClassPageContent(props: PageProps<"/teacher/classes/[id]">) {
  const teacher = await requireTeacher();
  const { id } = await props.params;
  const tabParam = (await props.searchParams).tab as string | undefined;
  const cls = await teacherClass(id, teacher.id);
  if (!cls) notFound();

  const [rows, assignments, texts] = await Promise.all([
    classOverview(cls.id),
    db.assignment.findMany({
      where: { classId: cls.id },
      include: { text: { select: { title: true } }, recipients: { select: { completedAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.text.findMany({
      where: { OR: [{ ownerId: null }, { ownerId: teacher.id }] },
      select: { id: true, title: true, genre: true, track: true },
      orderBy: [{ track: "asc" }, { title: "asc" }],
    }),
  ]);
  const history = await planHistory(rows.map((r) => r.id), cls.dailyMinutes);
  const now = new Date();
  const flagged = rows.filter((r) => r.flags.length);
  const active = rows.filter((r) => r.weekMinutes > 0).length;

  const tab = TABS.some((t) => t.key === tabParam) ? tabParam! : "students";
  const base = `/teacher/classes/${cls.id}`;
  const lateCount = assignments.filter((a) => a.kind === "TEXT" && a.dueAt && a.dueAt < now && a.recipients.some((r) => !r.completedAt)).length;

  return (
    <div>
      <PageHeader
        title={cls.name}
        subtitle={<>Join code <strong className="text-ink">{cls.joinCode}</strong> · {rows.length} student{rows.length === 1 ? "" : "s"} · {active} active this week{flagged.length ? <> · <span className="text-warn">{flagged.length} need{flagged.length === 1 ? "s" : ""} attention</span></> : null}</>}
        action={<a href={`/api/teacher/classes/${cls.id}/export`} download className="text-sm">Export CSV</a>}
      />
      <Tabs
        current={tab}
        items={TABS.map((t) => ({
          key: t.key,
          href: t.key === "students" ? base : `${base}?tab=${t.key}`,
          label: t.key === "assign" && lateCount ? <>{t.label} <span className="text-bad">· {lateCount} late</span></> : t.label,
        }))}
      />

      {tab === "students" && (
        <div className="space-y-6">
          {flagged.length > 0 && (
            <ul className="space-y-2 rounded-md border border-warn/40 bg-warn-soft/40 p-4 text-sm">
              {flagged.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`${base}/students/${r.id}`} className="font-medium">{r.name}</Link>
                  {r.flags.map((f) => <span key={f.kind} className="text-warn">{f.label}: {f.detail}.</span>)}
                </li>
              ))}
            </ul>
          )}
          {rows.length === 0 ? (
            <EmptyState title="No students yet">Share the code {cls.joinCode} with your students.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="border-b border-line text-sm text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-normal">Student</th>
                    <th className="py-2 pr-3 font-normal">Last 7 days</th>
                    <th className="py-2 pr-3 text-right font-normal">Minutes this week</th>
                    <th className="py-2 pr-3 text-right font-normal">Known words</th>
                    <th className="py-2 pr-3 text-right font-normal">Understanding</th>
                    <th className="py-2 pr-3 text-right font-normal">IELTS</th>
                    <th className="py-2 font-normal">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => {
                    const week = (history.byUser.get(r.id) ?? []).slice(-7);
                    return (
                      <tr key={r.id}>
                        <td className="py-2.5 pr-3">
                          <Link href={`${base}/students/${r.id}`}>{r.name}</Link>
                          {r.flags.length > 0 && <span className="ml-1.5 text-warn" title={r.flags.map((f) => f.label).join(", ")}>⚠</span>}
                        </td>
                        <td className="py-2.5 pr-3"><PlanDots days={week} /></td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{r.weekMinutes}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {r.knownCount.toLocaleString()} <span className="text-sm text-good">+{r.knownGrowth30}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{r.comprehension === null ? "–" : `${r.comprehension}%`}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{r.ieltsBand ?? "–"}</td>
                        <td className="py-2.5 text-muted">{ago(r.lastActiveAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-sm text-muted">Click a name for reading speed, skills, grammar and full statistics. Last 7 days: ✓ plan done, ◐ some practice.</p>
            </div>
          )}
        </div>
      )}

      {tab === "plan" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="max-w-2xl text-muted">
              Each day students should review their words, finish one text and practise for {cls.dailyMinutes} minutes. A day is
              complete (<span className="text-good">✓</span>) when they finished a text and reached the minutes; <span className="text-warn">◐</span> means some practice.
            </p>
            <DailyMinutesForm classId={cls.id} minutes={cls.dailyMinutes} />
          </div>
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="text-muted">
                    <th className="pr-4 text-left font-normal">Student</th>
                    {history.days.map((d, i) => (
                      <th key={d} className={`w-8 text-center font-normal ${i === history.days.length - 1 ? "text-ink" : ""}`}>
                        {new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}
                      </th>
                    ))}
                    <th className="pl-3 text-right font-normal">Complete</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const days = history.byUser.get(r.id) ?? [];
                    return (
                      <tr key={r.id}>
                        <td className="py-1 pr-4 whitespace-nowrap">{r.name}</td>
                        {days.map((d, i) => (
                          <td key={i} className="text-center" title={`${history.days[i]}: ${d}`}><PlanMark day={d} /></td>
                        ))}
                        <td className="pl-3 text-right tabular-nums">{days.filter((d) => d === "complete").length}/{days.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "assign" && (
        <div className="space-y-8">
          {assignments.length === 0 ? (
            <p className="text-muted">Nothing assigned yet.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {assignments.map((a) => {
                const late = a.dueAt && a.dueAt < now ? a.recipients.filter((r) => !r.completedAt).length : 0;
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span>
                      {a.kind === "TEXT" ? a.text?.title : <>Goal: {a.target?.toLocaleString()} {a.goalType && GOAL_LABEL[a.goalType]}</>}
                      {a.dueAt && <span className={late ? "text-bad" : "text-muted"}> · due {a.dueAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                      {a.note && <span className="block text-sm text-muted">{a.note}</span>}
                    </span>
                    <span className="flex items-center gap-4 text-sm text-muted">
                      {a.kind === "TEXT" ? (
                        <span>
                          {a.recipients.filter((r) => r.completedAt).length} of {a.recipients.length} finished
                          {late > 0 && <span className="text-bad"> · {late} late</span>}
                        </span>
                      ) : (
                        <span>{a.recipients.length} students</span>
                      )}
                      <DeleteAssignmentButton id={a.id} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="font-semibold">Assign a text</h2>
              <p className="mb-4 text-sm text-muted">Only students who know at least 95% of its words receive it. You&apos;ll see who was skipped.</p>
              <AssignTextForm classId={cls.id} texts={texts} />
            </Card>
            <Card>
              <h2 className="font-semibold">Set a weekly goal</h2>
              <p className="mb-4 text-sm text-muted">Shown on every student&apos;s Progress page.</p>
              <AssignGoalForm classId={cls.id} />
            </Card>
          </div>
        </div>
      )}

      {tab === "skills" && rows.length > 0 && (
        <div className="max-w-2xl">
          <p className="mb-4 text-muted">Average first-try accuracy by question type, across the class. Plan lessons around the lowest bars.</p>
          <ul className="space-y-3">
            {rows[0].skills.map((s) => {
              const scored = rows.map((r) => r.skills.find((x) => x.skill === s.skill)!).filter((x) => x.total > 0);
              const correct = scored.reduce((n, x) => n + x.correct, 0);
              const total = scored.reduce((n, x) => n + x.total, 0);
              const accuracy = total ? correct / total : null;
              return (
                <li key={s.skill}>
                  <div className="flex justify-between text-sm">
                    <span>{s.label}</span>
                    <span className="tabular-nums">{accuracy === null ? "–" : `${Math.round(accuracy * 100)}%`} <span className="text-muted">({total})</span></span>
                  </div>
                  <div className="mt-1 h-2 rounded-md bg-grid">
                    {accuracy !== null && <div className="h-full rounded-md" style={{ width: `${accuracy * 100}%`, background: accuracy < 0.6 ? "var(--warn)" : "var(--accent)" }} />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function PlanMark({ day }: { day: string }) {
  if (day === "complete") return <span className="text-good">✓</span>;
  if (day === "partial") return <span className="text-warn">◐</span>;
  return <span className="text-line">·</span>;
}

function PlanDots({ days }: { days: string[] }) {
  return (
    <span className="inline-flex gap-1.5 tracking-tight" aria-label={`${days.filter((d) => d === "complete").length} of ${days.length} days complete`}>
      {days.map((d, i) => <PlanMark key={i} day={d} />)}
    </span>
  );
}

export default function ClassPage(props: PageProps<"/teacher/classes/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClassPageContent {...props} />
    </Suspense>
  );
}
