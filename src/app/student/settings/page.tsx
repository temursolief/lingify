import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoutButton } from "@/components/logout-button";
import { TelegramCard } from "@/components/telegram-card";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { JoinClassForm } from "../join-class-form";
import { UzbekToggle } from "./uzbek-toggle";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const user = await requireStudent();
  const classes = await db.enrollment.findMany({ where: { userId: user.id }, include: { class: { include: { teacher: { select: { name: true } } } } } });
  return (
    <>
      <PageHeader title="Settings" subtitle={user.email} action={<LogoutButton />} />
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <p className="font-semibold">Uzbek translations</p>
          <p className="mt-1 text-muted">Add a short Uzbek translation to the flashcards you make from passages.</p>
          <UzbekToggle on={user.uzbekGlosses} />
        </Card>
        <Card>
          <p className="font-semibold">My classes</p>
          {classes.length ? (
            <ul className="mt-1">
              {classes.map((c) => <li key={c.classId}>{c.class.name} <span className="text-muted">· {c.class.teacher.name}</span></li>)}
            </ul>
          ) : (
            <p className="mt-1 text-muted">You are not in a class yet.</p>
          )}
          <JoinClassForm />
        </Card>
        <TelegramCard user={user} role="STUDENT" />
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}
