import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, EmptyState, PageHeader, PageSkeleton, SectionTitle, cx } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { classGame } from "@/lib/gamification";
import { formatDay } from "@/lib/time";
import { JoinClassForm } from "../join-class-form";

export const metadata: Metadata = { title: "Class" };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

async function ClassContent() {
  const user = await requireStudent();
  const game = await classGame(user.id);
  if (!game) {
    return (
      <>
        <PageHeader kicker="Class" title="Your class" />
        <Card lift className="max-w-md">
          <p className="text-[13px] text-soft">You are not in a class yet. Ask your teacher for the join code.</p>
          <JoinClassForm />
        </Card>
      </>
    );
  }
  const notes = await db.assignment.findMany({
    where: { classId: game.classId, note: { not: null }, recipients: { some: { studentId: user.id } } },
    orderBy: { createdAt: "desc" },
    take: 4,
    select: { id: true, note: true, createdAt: true, passage: { select: { title: true } }, lesson: { select: { title: true } } },
  });
  const pct = Math.min(100, Math.round((game.weekXp / game.goal) * 100));

  return (
    <>
      <PageHeader kicker={game.className} title="Your class" subtitle={`${game.students} student${game.students === 1 ? "" : "s"} · teacher ${game.teacherName}`} />
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2.5 rounded-xl bg-section p-5">
          <span className="text-[13px] text-[var(--color-accent-200)]">Class goal this week</span>
          <span className="text-xl font-medium sm:text-[22px]">{game.goal.toLocaleString("en-US")} XP together by Sunday</span>
          <div className="h-2 overflow-hidden rounded bg-section-ghost" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Class goal">
            <div className="h-full bg-[var(--color-accent-300)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-[var(--color-accent-200)]">
            {game.weekXp.toLocaleString("en-US")} XP so far · {game.daysLeft} day{game.daysLeft === 1 ? "" : "s"} left · you added {game.myWeekXp.toLocaleString("en-US")}
          </span>
        </div>

        <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
          {game.leagueEnabled && (
            <div className="flex flex-col gap-1.5">
              <SectionTitle title="Weekly league" note="resets on Monday · XP from honest work only" />
              {game.league.map((row, i) => (
                <div key={row.id} className={cx("flex items-center gap-3 rounded-lg px-3 py-2", row.you ? "bg-accent-soft" : "bg-surface")}>
                  <span className="w-[18px] text-xs text-muted tabular-nums">{i + 1}</span>
                  <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-neutral-800)] text-[11px] text-[var(--color-neutral-200)]">
                    {initials(row.name)}
                  </span>
                  <span className="flex-1 truncate text-[13px]">
                    {row.name}
                    {row.you && " (you)"}
                  </span>
                  <span className="text-[13px] text-soft tabular-nums">{row.xp} XP</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            <SectionTitle title={`From ${game.teacherName}`} />
            {notes.length ? (
              notes.map((n) => (
                <div key={n.id} className="flex flex-col gap-1.5 rounded-lg bg-surface p-3.5">
                  <span className="text-[11px] text-muted">
                    {n.passage?.title ?? n.lesson?.title} · {formatDay(n.createdAt, true)}
                  </span>
                  <span className="text-sm">{n.note}</span>
                </div>
              ))
            ) : (
              <Card>
                <EmptyState title="No notes yet">Notes your teacher adds to homework show up here.</EmptyState>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function ClassPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClassContent />
    </Suspense>
  );
}
