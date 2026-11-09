import { Suspense } from "react";
import type { Metadata } from "next";
import { GoalList } from "@/components/goal-list";
import { TextCard } from "@/components/text-card";
import { ButtonLink, Card, Stat, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { libraryFor } from "@/lib/recommend";
import { goalProgress, studentStats } from "@/lib/stats";
import { formatMinutes } from "@/lib/time";
import { JoinClassForm } from "./join-class-form";

export const metadata: Metadata = { title: "Home" };

const DEFAULT_WPM = 110;

async function StudentHomeContent() {
  const user = await requireStudent();
  const [library, stats, goals, classes] = await Promise.all([
    libraryFor(user.id),
    studentStats(user.id, 14),
    goalProgress(user.id),
    db.enrollment.findMany({ where: { userId: user.id }, include: { class: { include: { teacher: { select: { name: true } } } } } }),
  ]);
  const wpm = stats.wpmTrend.length ? stats.wpmTrend.slice(-5).reduce((n, p) => n + p.value, 0) / Math.min(5, stats.wpmTrend.length) : DEFAULT_WPM;
  const assigned = library.filter((t) => t.assigned && t.level !== "locked");
  const picks = library.filter((t) => t.level !== "locked" && !t.completed && !t.assigned).slice(0, 3);
  const openCount = library.filter((t) => t.level !== "locked").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hello, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted">
          You can read {openCount} of {library.length} texts. {stats.streak > 0 ? `You're on a ${stats.streak}-day streak. Keep it going!` : "Read something today to start a streak."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Known words" value={stats.knownCount.toLocaleString()} hint={`+${stats.newKnownThisWeek} learned this week`} />
        <Stat label="This week" value={formatMinutes(stats.weekSeconds)} hint={`${stats.weekWordsRead.toLocaleString()} words read`} />
        <Stat label="Streak" value={`${stats.streak} day${stats.streak === 1 ? "" : "s"}`} />
        <Stat label="Words to review" value={stats.dueCount} hint={stats.dueCount ? <a href="/student/review" className="text-accent underline">Review now</a> : "All done for now"} />
      </div>

      {assigned.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">From your teacher</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {assigned.map((t) => <TextCard key={t.id} entry={t} wpm={wpm} />)}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">Recommended for you</h2>
          <ButtonLink href="/student/library" variant="ghost">Whole library →</ButtonLink>
        </div>
        {picks.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {picks.map((t) => <TextCard key={t.id} entry={t} wpm={wpm} />)}
          </div>
        ) : (
          <Card className="text-sm text-muted">
            You have read everything at your level. Review your words to unlock new texts.
          </Card>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Weekly goals</h2>
            <ButtonLink href="/student/progress#goals" variant="ghost">Edit</ButtonLink>
          </div>
          <GoalList goals={goals} />
        </Card>
        <Card>
          <h2 className="font-semibold">My classes</h2>
          {classes.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {classes.map((c) => (
                <li key={c.classId}>{c.class.name} <span className="text-muted">· {c.class.teacher.name}</span></li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">You are not in a class yet. Ask your teacher for a code.</p>
          )}
          <JoinClassForm />
        </Card>
      </div>
    </div>
  );
}

export default function StudentHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentHomeContent />
    </Suspense>
  );
}
