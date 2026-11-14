import { Suspense } from "react";
import type { Metadata } from "next";
import { Castle } from "@/components/castle";
import { Podium } from "@/components/game";
import { Crown } from "@/components/icons";
import { Card, EmptyState, PageHeader, PageSkeleton, SectionTitle, cx } from "@/components/ui";
import { rivalLine, STAGES } from "@/lib/fortress";
import { fmtXp } from "@/lib/xp";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { classGame } from "@/lib/gamification";
import { formatDay } from "@/lib/time";
import { JoinClassForm } from "../join-class-form";

export const metadata: Metadata = { title: "Class" };

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
  const line = rivalLine(game.league);

  return (
    <>
      <PageHeader kicker={game.className} title="Your class" subtitle={`${game.students} student${game.students === 1 ? "" : "s"} · teacher ${game.teacherName}`} />
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2.5 rounded-xl bg-section p-5">
          <span className="kicker text-gold">Class goal this week</span>
          <span className="font-display text-2xl font-bold sm:text-[28px]">{fmtXp(game.goal)} XP together by Sunday</span>
          <div className="h-2.5 overflow-hidden rounded-[2px] bg-section-ghost" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Class goal">
            <div className="h-full bg-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-soft">
            {fmtXp(game.weekXp)} XP so far · {game.daysLeft} day{game.daysLeft === 1 ? "" : "s"} left · you added {fmtXp(game.myWeekXp)}
          </span>
        </div>

        <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
          {game.leagueEnabled && (
            <div className="flex flex-col gap-2.5">
              <SectionTitle title="Weekly league" note="resets Monday · honest work only" />
              <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
                {game.students > 1 && <Podium rows={game.league} />}
                {game.students > 1 && (
                  <p className={cx("rounded-md px-3 py-2 text-[13px] font-semibold", line.kind === "lead" ? "bg-good-soft text-good" : "bg-accent-soft text-accent-ink")}>{line.text}</p>
                )}
                {game.lastChampions.length > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <Crown size={14} weight="fill" className="text-gold" aria-hidden />
                    Last week&apos;s champion: {game.lastChampions.join(", ")}
                  </p>
                )}
              </div>
              <ol className="flex flex-col gap-1.5">
                {game.league.map((row, i) => (
                  <li key={row.id} className={cx("flex items-center gap-3 rounded-lg border px-3 py-1.5", row.you ? "border-accent bg-accent-soft" : "border-line bg-surface")}>
                    <span className="w-5 font-display text-lg font-bold text-muted tabular-nums">{i + 1}</span>
                    <Castle stage={row.stage} className="w-12 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">
                        {row.name}
                        {row.you && " (you)"}
                      </span>
                      <span className="text-[11px] text-muted">
                        Lv {row.level} · {STAGES[row.stage]!.name}
                      </span>
                    </span>
                    {row.crowns > 0 && (
                      <span className="flex items-center gap-0.5 text-xs font-semibold text-brass" title={`${row.crowns} week${row.crowns === 1 ? "" : "s"} won`}>
                        <Crown size={14} weight="fill" className="text-gold" aria-hidden />
                        {row.crowns}
                      </span>
                    )}
                    <span className="font-display text-[17px] font-bold tabular-nums">{fmtXp(row.xp)}</span>
                    <span className="caps text-[10px] text-muted">XP</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            <SectionTitle title={`From ${game.teacherName}`} />
            {notes.length ? (
              notes.map((n) => (
                <div key={n.id} className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-3.5">
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
