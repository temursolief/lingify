import { Suspense } from "react";
import type { Metadata } from "next";
import { GoalList } from "@/components/goal-list";
import { LearningProfileView } from "@/components/learning-profile";
import { StudentStatsView } from "@/components/student-stats";
import { ButtonLink, Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { learningProfile } from "@/lib/profile";
import { goalProgress, studentStats } from "@/lib/stats";
import { GoalForm, RemoveGoalButton } from "./goal-form";

export const metadata: Metadata = { title: "Progress" };

async function ProgressPageContent() {
  const user = await requireStudent();
  const [stats, goals] = await Promise.all([studentStats(user.id), goalProgress(user.id)]);
  const profile = await learningProfile(user.id, stats);
  return (
    <div className="space-y-6">
      <PageHeader
        title="My progress"
        subtitle={user.estimatedVocab ? `You started with about ${user.estimatedVocab.toLocaleString()} known words.` : undefined}
        action={<ButtonLink href="/student/placement" variant="secondary">Retake placement</ButtonLink>}
      />
      <Card id="goals">
        <h2 className="font-semibold">Weekly goals</h2>
        <GoalList goals={goals} actions={(g) => (g.fromTeacher ? null : <RemoveGoalButton goalId={g.id} />)} />
        <GoalForm />
      </Card>
      <LearningProfileView profile={profile} />
      <StudentStatsView stats={stats} />
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
