import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LearningProfileView } from "@/components/learning-profile";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { learningProfile } from "@/lib/profile";
import { studentStats } from "@/lib/stats";
import { ProgressTabs } from "../progress-tabs";

export const metadata: Metadata = { title: "Skills" };

async function SkillsContent() {
  const user = await requireStudent();
  const stats = await studentStats(user.id);
  const profile = await learningProfile(user.id, stats);
  return (
    <div>
      <PageHeader title="Progress" />
      <ProgressTabs current="skills" />
      <LearningProfileView profile={profile} />
      <p className="mt-6 text-sm text-muted">
        Think your vocabulary score is wrong? <Link href="/student/placement">Retake the placement test</Link>.
      </p>
    </div>
  );
}

export default function SkillsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SkillsContent />
    </Suspense>
  );
}
