import { Suspense } from "react";
import type { Metadata } from "next";
import { GoalList } from "@/components/goal-list";
import { StudentStatsView } from "@/components/student-stats";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { goalProgress, studentStats } from "@/lib/stats";
import { ProgressTabs } from "./progress-tabs";

export const metadata: Metadata = { title: "Progress" };

async function ProgressPageContent() {
  const user = await requireStudent();
  const [stats, goals] = await Promise.all([studentStats(user.id), goalProgress(user.id)]);
  return (
    <>
      <PageHeader title="Progress" subtitle="How your English is growing" />
      <ProgressTabs current="overview" />
      <div className="mx-auto max-w-4xl space-y-4">
        <StudentStatsView stats={stats} simple />
        {goals.length > 0 && (
          <Card>
            <p className="font-semibold">Goals from your teacher</p>
            <GoalList goals={goals} />
          </Card>
        )}
      </div>
    </>
  );
}

export default function ProgressPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProgressPageContent />
    </Suspense>
  );
}
