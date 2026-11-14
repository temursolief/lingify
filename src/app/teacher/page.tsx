import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenText, Headphones, Plus, SealCheck } from "@/components/icons";
import { accentOutline, Card, PageHeader, PageSkeleton, ProgressBar, quietOutline, SectionTitle } from "@/components/ui";
import { getSession, requireTeacher } from "@/lib/auth";
import { dueLabel, teacherToday, type Attention } from "@/lib/teacher-today";
import { formatLongDay } from "@/lib/time";
import { NudgeButton, RetakeNowButton } from "./today-actions";

export const metadata: Metadata = { title: "Today" };

const DOT: Record<Attention["tone"], string> = {
  bad: "var(--bad)",
  warn: "var(--brass)",
  accent: "var(--accent)",
  muted: "var(--color-neutral-500)",
};

function Fix({ item }: { item: Attention }) {
  const a = item.action;
  if (a.kind === "retake") return <RetakeNowButton kind={a.attemptKind} attemptId={a.attemptId} name={a.name} />;
  if (a.kind === "nudge") return <NudgeButton studentId={a.studentId} name={a.name} linked={a.linked} />;
  return (
    <Link href={a.href} className={accentOutline}>
      {a.label}
    </Link>
  );
}

async function TodayContent() {
  // The session cookie names the teacher without a query, so the list is fetched alongside the account check instead
  // of after it; requireTeacher still sends anyone else away before anything is shown.
  const session = await getSession();
  const [, today] = await Promise.all([requireTeacher(), session ? teacherToday(session.userId) : null]);
  const { items, dueSoon, classes, students } = today!;
  const firstClass = dueSoon[0]?.classId;
  return (
    <>
      <PageHeader
        title={items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} need${items.length === 1 ? "s" : ""} you` : "Nothing needs you right now"}
        subtitle={`${formatLongDay(new Date())} · ${classes} class${classes === 1 ? "" : "es"} · ${students} student${students === 1 ? "" : "s"}`}
        action={
          <Link href={firstClass ? `/teacher/classes/${firstClass}?tab=homework` : "/teacher/classes"} className={`${accentOutline} px-4 py-2 text-sm font-medium`}>
            <Plus size={16} aria-hidden />
            Assign homework
          </Link>
        }
      />
      <div className="flex flex-col gap-5">
        {items.length ? (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3.5">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[item.tone] }} />
                <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
                  <span className="font-medium">{item.title}</span>
                  {item.meta && <span className="text-xs text-muted">{item.meta}</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Fix item={item} />
                  <Link href={item.href} className={quietOutline}>
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="flex items-center gap-3">
            <SealCheck size={26} weight="fill" className="text-good" aria-hidden />
            <span className="text-[13px] text-soft">All clear.</span>
          </Card>
        )}

        {dueSoon.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <SectionTitle title="Homework coming due" />
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
              {dueSoon.map((d) => {
                const I = d.kind === "reading" ? BookOpenText : Headphones;
                return (
                  <Link
                    key={d.id}
                    href={`/teacher/classes/${d.classId}?tab=homework&a=${d.id}`}
                    className="flex flex-col gap-2 rounded-lg border border-line p-3.5 text-ink no-underline hover:border-[var(--color-accent-600)] hover:no-underline"
                  >
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <I size={14} aria-hidden />
                      {d.className} · due {dueLabel(d.dueAt)}
                    </span>
                    <span className="font-medium">{d.title}</span>
                    <ProgressBar value={d.total ? d.done / d.total : 0} label={`${d.title} completion`} />
                    <span className="text-xs text-soft">
                      {d.done} of {d.total} complete
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function TeacherToday() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TodayContent />
    </Suspense>
  );
}
