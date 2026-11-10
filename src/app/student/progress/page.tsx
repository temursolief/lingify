import { Suspense } from "react";
import type { Metadata } from "next";
import { GoalList } from "@/components/goal-list";
import { StudentStatsView } from "@/components/student-stats";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { goalProgress, studentStats } from "@/lib/stats";
import { GoalForm, RemoveGoalButton } from "./goal-form";
import { ProgressTabs } from "./progress-tabs";

export const metadata: Metadata = { title: "Progress" };

async function ProgressPageContent() {
  const user = await requireStudent();
  const [stats, goals] = await Promise.all([studentStats(user.id), goalProgress(user.id)]);
  return (
    <div>
      <PageHeader title="Progress" />
      <ProgressTabs current="overview" />
      <div className="space-y-6">
        <StudentStatsView stats={stats} simple />
        <Card id="goals">
          <h2 className="font-semibold">Weekly goals</h2>
          <GoalList goals={goals} actions={(g) => (g.fromTeacher ? null : <RemoveGoalButton goalId={g.id} />)} />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-accent">Add my own goal</summary>
            <GoalForm />
          </details>
        </Card>
      </div>
    </div>
  );
}

export default function ProgressPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProgressPageContent />
    </Suspense>
  );
}
