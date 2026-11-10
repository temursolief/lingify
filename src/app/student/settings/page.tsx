import type { Metadata } from "next";
import { Suspense } from "react";
import { TelegramCard } from "@/components/telegram-card";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { JoinClassForm } from "../join-class-form";
import { UzbekToggle } from "./uzbek-toggle";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const user = await requireStudent({ allowWithoutPlacement: true });
  const classes = await db.enrollment.findMany({ where: { userId: user.id }, include: { class: { include: { teacher: { select: { name: true } } } } } });
  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="Settings" />
      <Card>
        <h2 className="font-semibold">Uzbek translations</h2>
        <p className="mt-1 text-muted">Show a short Uzbek translation next to English meanings of words and phrases.</p>
        <UzbekToggle on={user.uzbekGlosses} />
      </Card>
      <TelegramCard user={user} role="STUDENT" />
      <Card>
        <h2 className="font-semibold">My classes</h2>
        {classes.length ? (
          <ul className="mt-1">
            {classes.map((c) => <li key={c.classId}>{c.class.name} <span className="text-muted">· {c.class.teacher.name}</span></li>)}
          </ul>
        ) : (
          <p className="mt-1 text-muted">You are not in a class yet.</p>
        )}
        <JoinClassForm />
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}
