import { Suspense } from "react";
import type { Metadata } from "next";
import { Folder, FolderGrid, FoldersSkeleton } from "@/components/folder";
import { Card, PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { studentSections } from "@/lib/student-sections";
import { JoinClassForm } from "./join-class-form";

export const metadata: Metadata = { title: "Home" };

const COLORS = ["var(--series-1)", "var(--series-3)", "var(--series-2)", "var(--series-5)"];

async function StudentHomeContent() {
  const user = await requireStudent();
  const enrolled = await db.enrollment.count({ where: { userId: user.id } });
  if (!enrolled) {
    return (
      <>
        <PageHeader title={`Hi, ${user.name.split(/\s+/)[0]}`} subtitle="Join a class to see what your teacher has for you" />
        <Card className="mx-auto max-w-md text-center">
          <p>You are not in a class yet. Ask your teacher for a join code.</p>
          <JoinClassForm />
        </Card>
      </>
    );
  }
  const sections = await studentSections(user.id);
  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(/\s+/)[0]}`} subtitle="What are we practising today?" />
      <FolderGrid four>
        {sections.map((s, i) => (
          <Folder key={s.href} {...s} color={COLORS[i % COLORS.length]} />
        ))}
      </FolderGrid>
    </>
  );
}

export default function StudentHome() {
  return (
    <Suspense fallback={<FoldersSkeleton />}>
      <StudentHomeContent />
    </Suspense>
  );
}

