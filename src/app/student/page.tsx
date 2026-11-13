import { Suspense } from "react";
import type { Metadata } from "next";
import { BandPath, ClassGoalBar, HomeworkRow, NextUpCard, QuestList, StatChip } from "@/components/game";
import { Fire, Lightning, ShieldCheck } from "@/components/icons";
import { Card, EmptyState, SectionTitle, Skeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { studentSummary } from "@/lib/class-overview";
import { db } from "@/lib/db";
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex flex-col gap-1">
          <span className="text-[13px] text-muted">{formatLongDay(now)}</span>
          <h1 className="text-2xl sm:text-[30px]">
            {greeting(now)}, {first}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatChip icon={<Fire size={16} weight="fill" className={game.todayDone ? "text-flame" : "text-faint"} aria-hidden />} value={game.streak} label="day streak" />
          <StatChip icon={<Lightning size={16} weight="fill" className="text-[var(--color-accent-400)]" aria-hidden />} value={game.xp.toLocaleString("en-US")} label={`XP · Lv ${game.level}`} />
          <StatChip icon={<ShieldCheck size={16} className="text-[var(--color-accent-400)]" aria-hidden />} value={game.shields} label={game.shields === 1 ? "shield" : "shields"} />
        </div>
      </div>

      <NextUpCard {...next} />

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
        <div className="flex flex-col gap-2.5">
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
          <SectionTitle title="Daily quests" note="finish all 3 → streak shield" />
          <QuestList quests={game.quests} />
          <BandPath band={summary.band} target={user.targetBand} href="/student/progress" />
        </div>
      </div>

      {cls && <ClassGoalBar game={cls} />}

      <p className="text-xs text-faint">
        One real action a day keeps your streak: 10 cards, one proof or a first try. +{game.todayXp} XP today.
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
      <Skeleton className="h-32 rounded-xl" />
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
