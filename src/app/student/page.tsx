import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BandPath, ClassGoalBar, FortressCard, HomeworkRow, LeagueCard, NextUpCard, QuestList } from "@/components/game";
import { StageUp } from "@/components/stage-up";
import { Card, EmptyState, SectionTitle, Skeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { studentSummary } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { fortressOf } from "@/lib/fortress";
import { classGame, studentGame } from "@/lib/gamification";
import { formatLongDay, hourOf } from "@/lib/time";
import { nextUp, studentHomework } from "@/lib/today";
import { JoinClassForm } from "./join-class-form";

export const metadata: Metadata = { title: "Today" };

function greeting(now: Date) {
  const h = hourOf(now);
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

async function TodayContent() {
  const user = await requireStudent();
  const now = new Date();
  const first = user.name.split(/\s+/)[0];
  const enrolled = await db.enrollment.count({ where: { userId: user.id } });
  if (!enrolled) {
    return (
      <div className="flex max-w-xl flex-col gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-muted">{formatLongDay(now)}</span>
          <h1 className="text-2xl sm:text-[30px]">
            {greeting(now)}, {first}
          </h1>
        </div>
        <Card lift className="flex flex-col gap-2">
          <span className="kicker">Start here</span>
          <span className="text-[17px] font-medium">Join your class</span>
          <p className="text-[13px] text-soft">Ask your teacher for the six-letter join code. Your homework, words and class goal appear here once you are in.</p>
          <JoinClassForm />
        </Card>
      </div>
    );
  }

  const [game, cls, homework, next, summary] = await Promise.all([studentGame(user.id), classGame(user.id), studentHomework(user.id), nextUp(user.id), studentSummary(user.id)]);
  // Unfinished homework, then what was finished in the last week.
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const shown = homework.filter((h) => h.state !== "done" || (h.completedAt && h.completedAt.getTime() > weekAgo)).slice(0, 5);

  const fortress = fortressOf(game.xp);
  const crowns = cls?.leagueEnabled ? (cls.league.find((r) => r.you)?.crowns ?? 0) : 0;
  const questsDone = game.quests.filter((q) => q.done).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="caps text-[12px] text-muted">{formatLongDay(now)}</span>
        <h1 className="text-[28px] sm:text-[34px]">
          {greeting(now)}, {first}
        </h1>
      </div>

      <StageUp stage={fortress.stage} name={fortress.current.name} last={!fortress.ahead.length} />
      <FortressCard game={game} crowns={crowns} />
      <NextUpCard {...next} />

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
        <div className="flex flex-col gap-2.5">
          <SectionTitle title="Daily quests" note={questsDone === 3 ? "all done · shield earned" : `${questsDone}/3 · all 3 earn a shield`} />
          <QuestList quests={game.quests} />
          <SectionTitle title="Homework" note={cls ? `from ${cls.teacherName}` : undefined} />
          {shown.length ? (
            shown.map((h) => <HomeworkRow key={h.href} h={h} now={now} />)
          ) : (
            <Card>
              <EmptyState title="No homework right now">Your teacher&apos;s next task will show up here.</EmptyState>
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          {cls?.leagueEnabled && cls.students > 1 && <LeagueCard cls={cls} />}
          {cls && <ClassGoalBar game={cls} />}
          <BandPath band={summary.band} target={user.targetBand} href="/student/progress" />
        </div>
      </div>

      <p className="text-xs text-faint">
        {game.todayDone ? "Beacon lit for today." : "Light today's beacon: 10 cards, one proof or a first try."} <Link href="/student/progress#xp">How XP is earned</Link>
      </p>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-72" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}

export default function StudentToday() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayContent />
    </Suspense>
  );
}
