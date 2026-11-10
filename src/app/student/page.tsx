import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { TodayPlan } from "@/components/today-plan";
import { ButtonLink, Card, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { dailyPlan } from "@/lib/daily-plan";
import { db } from "@/lib/db";
import { libraryFor } from "@/lib/recommend";
import { studentStats } from "@/lib/stats";
import { readingMinutes } from "@/lib/texts";
import { JoinClassForm } from "./join-class-form";

export const metadata: Metadata = { title: "Today" };

const DEFAULT_WPM = 110;

async function StudentHomeContent() {
  const user = await requireStudent();
  const [library, stats, plan, classCount] = await Promise.all([
    libraryFor(user.id),
    studentStats(user.id, 14),
    dailyPlan(user.id),
    db.enrollment.count({ where: { userId: user.id } }),
  ]);
  const wpm = stats.wpmTrend.length ? stats.wpmTrend.slice(-5).reduce((n, p) => n + p.value, 0) / Math.min(5, stats.wpmTrend.length) : DEFAULT_WPM;
  const open = library.filter((t) => t.level !== "locked" && !t.completed);
  const next = open.find((t) => t.assigned) ?? open[0];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-[1.75rem] leading-tight font-semibold">Hello, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted">
          {stats.streak > 0 ? `${stats.streak}-day streak` : "Start a streak today"} · {stats.knownCount.toLocaleString()} words known
        </p>
      </div>

      <TodayPlan plan={plan} />

      {next && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Next text for you</h2>
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Link href={`/student/read/${next.slug}`} className="text-lg font-medium no-underline hover:underline">{next.title}</Link>
              <p className="mt-0.5 text-muted">{next.summary}</p>
              <p className="mt-1 text-sm text-muted">
                {next.genre} · about {readingMinutes(next.wordCount, wpm)} min · you know {(next.coverage * 100).toFixed(0)}% of the words
                {next.assigned && <span className="text-accent"> · from your teacher</span>}
              </p>
            </div>
            <ButtonLink href={`/student/read/${next.slug}`}>Start reading</ButtonLink>
          </Card>
          <p className="mt-2 text-sm"><Link href="/student/library">Choose another text</Link></p>
        </section>
      )}

      {classCount === 0 && (
        <Card>
          <h2 className="font-semibold">Join your class</h2>
          <p className="mt-1 text-sm text-muted">Enter the code your teacher gave you so they can follow your progress.</p>
          <JoinClassForm />
        </Card>
      )}
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
