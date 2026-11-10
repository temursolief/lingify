import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoalList } from "@/components/goal-list";
import { LearningProfileView } from "@/components/learning-profile";
import { StudentStatsView } from "@/components/student-stats";
import { Badge, Card, PageHeader, PageSkeleton, Tabs } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { teacherClass } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { flagsFor } from "@/lib/flags";
import { learningProfile } from "@/lib/profile";
import { goalProgress, studentStats } from "@/lib/stats";
import { RemoveStudentButton } from "../../../../teacher-forms";

export const metadata: Metadata = { title: "Student" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "skills", label: "Skills" },
  { key: "ielts", label: "IELTS" },
  { key: "activity", label: "All statistics" },
];

async function StudentDetailPageContent(props: PageProps<"/teacher/classes/[id]/students/[studentId]">) {
  const teacher = await requireTeacher();
  const { id, studentId } = await props.params;
  const tabParam = (await props.searchParams).tab as string | undefined;
  const cls = await teacherClass(id, teacher.id);
  if (!cls) notFound();
  const enrollment = await db.enrollment.findUnique({
    where: { userId_classId: { userId: studentId, classId: cls.id } },
    include: { user: true },
  });
  if (!enrollment) notFound();
  const student = enrollment.user;

  const [stats, flags, goals, learning, ielts] = await Promise.all([
    studentStats(student.id),
    flagsFor(student.id),
    goalProgress(student.id),
    db.lemmaState.findMany({ where: { userId: student.id, status: "LEARNING" }, orderBy: { lookups: "desc" }, take: 40, select: { lemma: true, lookups: true, isPhrase: true } }),
    db.ieltsAttempt.findMany({ where: { userId: student.id }, orderBy: { createdAt: "desc" }, take: 8, include: { text: { select: { title: true } } } }),
  ]);

  const tab = TABS.some((t) => t.key === tabParam) ? tabParam! : "overview";
  const base = `/teacher/classes/${cls.id}/students/${student.id}`;

  return (
    <div>
      <Link href={`/teacher/classes/${cls.id}`} className="text-sm text-muted no-underline hover:text-ink">← {cls.name}</Link>
      <PageHeader
        title={student.name}
        subtitle={`${student.email} · started at about ${student.estimatedVocab?.toLocaleString() ?? "?"} known words`}
        action={<RemoveStudentButton classId={cls.id} studentId={student.id} name={student.name} />}
      />
      <Tabs current={tab} items={TABS.map((t) => ({ ...t, href: t.key === "overview" ? base : `${base}?tab=${t.key}` }))} />

      {tab === "overview" && (
        <div className="space-y-6">
          {flags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {flags.map((f) => <Badge key={f.kind} tone={f.kind === "inactive" ? "warn" : "bad"}>⚠ {f.label}: {f.detail}</Badge>)}
            </div>
          )}
          <StudentStatsView stats={stats} simple />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="font-semibold">Goals</h2>
              <GoalList goals={goals} />
            </Card>
            <Card>
              <h2 className="font-semibold">Words they are learning</h2>
              <p className="mb-3 text-sm text-muted">Most looked-up first. Good candidates to talk about in class.</p>
              {learning.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {learning.map((w) => <Badge key={w.lemma} tone={w.isPhrase ? "accent" : "neutral"}>{w.lemma}{w.lookups > 1 ? ` ×${w.lookups}` : ""}</Badge>)}
                </div>
              ) : (
                <p className="text-sm text-muted">None yet.</p>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "skills" && <LearningProfileView profile={await learningProfile(student.id, stats)} viewer="teacher" />}

      {tab === "ielts" &&
        (ielts.length === 0 ? (
          <p className="text-muted">No IELTS passages taken yet.</p>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-line text-sm text-muted">
              <tr><th className="py-2 font-normal">Passage</th><th className="py-2 text-right font-normal">Score</th><th className="py-2 text-right font-normal">Band (est.)</th><th className="py-2 text-right font-normal">Time</th><th className="py-2 text-right font-normal">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ielts.map((a) => (
                <tr key={a.id}>
                  <td className="py-2">{a.text.title}</td>
                  <td className="py-2 text-right tabular-nums">{a.correct}/{a.total}</td>
                  <td className="py-2 text-right tabular-nums">{a.band}</td>
                  <td className="py-2 text-right tabular-nums">{Math.round(a.seconds / 60)} min</td>
                  <td className="py-2 text-right">{a.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}

      {tab === "activity" && <StudentStatsView stats={stats} readLinks={false} />}
    </div>
  );
}

export default function StudentDetailPage(props: PageProps<"/teacher/classes/[id]/students/[studentId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentDetailPageContent {...props} />
    </Suspense>
  );
}
