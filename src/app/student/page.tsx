import { Suspense } from "react";
import type { Metadata } from "next";
import { Folder, FolderGrid, FoldersSkeleton } from "@/components/folder";
import { PageHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { studentSections } from "@/lib/student-sections";

export const metadata: Metadata = { title: "Home" };

const COLORS = ["var(--series-1)", "var(--series-3)", "var(--series-2)", "var(--series-5)"];

async function StudentHomeContent() {
  const user = await requireStudent();
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

