import { Suspense } from "react";
import type { Metadata } from "next";
import { TodayPlan } from "@/components/today-plan";
import { ButtonLink, Card, PageHeader, PageSkeleton } from "@/components/ui";
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
    <>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        subtitle={`${stats.streak > 0 ? `${stats.streak}-day streak` : "Start a streak today"} · ${stats.knownCount.toLocaleString()} words known`}
      />
      <div className="mx-auto max-w-2xl space-y-4">
        <TodayPlan plan={plan} />

        {next && (
          <Card>
            <p className="text-sm text-muted">{next.assigned ? "From your teacher" : "Next text for you"}</p>
            <p className="mt-0.5 text-lg font-semibold">{next.title}</p>
            <p className="mt-1 text-muted">{next.summary}</p>
            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-sm text-muted">
                {next.genre} · about {readingMinutes(next.wordCount, wpm)} min · you know {(next.coverage * 100).toFixed(0)}% of the words
              </span>
              <ButtonLink href={`/student/read/${next.slug}`}>Start reading</ButtonLink>
            </div>
          </Card>
        )}

        {classCount === 0 && (
          <Card>
            <p className="font-semibold">Join your class</p>
            <p className="mt-1 text-sm text-muted">Enter the code your teacher gave you so they can follow your progress.</p>
            <JoinClassForm />
          </Card>
        )}
      </div>
    </>
  );
}

export default function StudentHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentHomeContent />
    </Suspense>
  );
}
