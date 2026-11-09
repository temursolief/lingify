import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader, Stat, PageSkeleton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { classOverview, teacherClass } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { GOAL_LABEL } from "@/lib/stats";
import { AssignGoalForm, AssignTextForm, DeleteAssignmentButton } from "../../teacher-forms";

export const metadata: Metadata = { title: "Class" };

function ago(date: Date | null) {
  if (!date) return "never";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

async function ClassPageContent(props: PageProps<"/teacher/classes/[id]">) {
  const teacher = await requireTeacher();
  const { id } = await props.params;
  const cls = await teacherClass(id, teacher.id);
  if (!cls) notFound();

  const [rows, assignments, texts] = await Promise.all([
    classOverview(cls.id),
    db.assignment.findMany({
      where: { classId: cls.id },
      include: { text: { select: { title: true } }, recipients: { select: { completedAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.text.findMany({ select: { id: true, title: true, genre: true }, orderBy: { title: "asc" } }),
  ]);
  const flagged = rows.filter((r) => r.flags.length);
  const active = rows.filter((r) => r.weekMinutes > 0).length;
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={cls.name}
        subtitle={<>Join code <strong className="text-ink">{cls.joinCode}</strong> · {rows.length} student{rows.length === 1 ? "" : "s"}</>}
        action={
          <a href={`/api/teacher/classes/${cls.id}/export`} download className="inline-flex items-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-paper">
            Export CSV
          </a>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active this week" value={`${active} / ${rows.length}`} />
        <Stat label="Avg. minutes this week" value={avg(rows.map((r) => r.weekMinutes))} />
        <Stat label="Avg. words read this week" value={avg(rows.map((r) => r.weekWords)).toLocaleString()} />
        <Stat label="Need attention" value={flagged.length} hint={flagged.length ? "See alerts below" : "Everyone is on track"} />
      </div>

      {flagged.length > 0 && (
        <Card className="border-warn/40">
          <h2 className="font-semibold">Alerts</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {flagged.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/teacher/classes/${cls.id}/students/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                {r.flags.map((f) => (
                  <Badge key={f.kind} tone={f.kind === "inactive" ? "warn" : "bad"}>⚠ {f.label}: {f.detail}</Badge>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="p-5 pb-3">
          <h2 className="font-semibold">Students</h2>
          <p className="text-sm text-muted">This week&apos;s active minutes by activity, reading volume and vocabulary. Click a name for full statistics.</p>
        </div>
        {rows.length === 0 ? (
          <div className="p-5 pt-0"><EmptyState title="No students yet">Share the code {cls.joinCode} with your students.</EmptyState></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-paper text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 text-right font-medium">Week min</th>
                  <th className="px-3 py-2 font-medium">Read · Quiz · Vocab · Gram · Review</th>
                  <th className="px-3 py-2 text-right font-medium">Words (week / total)</th>
                  <th className="px-3 py-2 text-right font-medium">Known words</th>
                  <th className="px-3 py-2 text-right font-medium">Compr.</th>
                  <th className="px-3 py-2 text-right font-medium">WPM</th>
                  <th className="px-3 py-2 text-right font-medium">Streak</th>
                  <th className="px-5 py-2 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const a = r.weekMinutesByActivity;
                  return (
                    <tr key={r.id} className="hover:bg-paper/60">
                      <td className="px-5 py-3">
                        <Link href={`/teacher/classes/${cls.id}/students/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                        {r.flags.length > 0 && <span className="ml-1.5 text-warn" title={r.flags.map((f) => f.label).join(", ")}>⚠</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.weekMinutes}</td>
                      <td className="px-3 py-3 tabular-nums text-muted">{a.reading} · {a.quiz} · {a.vocab} · {a.grammar} · {a.review}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.weekWords.toLocaleString()} / {r.totalWords.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {r.knownCount.toLocaleString()} <span className="text-good">+{r.knownGrowth30}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.comprehension === null ? "–" : `${r.comprehension}%`}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.avgWpm ?? "–"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.streak}</td>
                      <td className="px-5 py-3 text-muted">{ago(r.lastActiveAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Assign a text</h2>
          <p className="mb-4 text-sm text-muted">Only students who already know at least 95% of its words receive it. You&apos;ll see who was skipped.</p>
          <AssignTextForm classId={cls.id} texts={texts} />
        </Card>
        <Card>
          <h2 className="font-semibold">Set a weekly goal</h2>
          <p className="mb-4 text-sm text-muted">Goals show on every student&apos;s home page with their progress.</p>
          <AssignGoalForm classId={cls.id} />
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Assignments</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted">Nothing assigned yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {a.kind === "TEXT" ? (
                    <><Badge>Text</Badge> {a.text?.title}</>
                  ) : (
                    <><Badge tone="accent">Goal</Badge> {a.target?.toLocaleString()} {a.goalType && GOAL_LABEL[a.goalType]}</>
                  )}
                  {a.note && <span className="text-muted"> · {a.note}</span>}
                </span>
                <span className="flex items-center gap-3 text-muted">
                  {a.kind === "TEXT" && <span>{a.recipients.filter((r) => r.completedAt).length} / {a.recipients.length} finished</span>}
                  {a.kind === "GOAL" && <span>{a.recipients.length} students</span>}
                  <DeleteAssignmentButton id={a.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function ClassPage(props: PageProps<"/teacher/classes/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClassPageContent {...props} />
    </Suspense>
  );
}
