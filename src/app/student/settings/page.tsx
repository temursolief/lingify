import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoutButton } from "@/components/logout-button";
import { TelegramCard } from "@/components/telegram-card";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { db } from "@/lib/db";
import { JoinClassForm } from "../join-class-form";
import { TargetBandPicker, UzbekToggle } from "./uzbek-toggle";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const user = await requireStudent();
  // The student's classes with their teachers: one query.
  const classes = (
    await db.$queryRaw<{ classId: string; name: string; teacher: string; pending: boolean; hasPassword: boolean }[]>`
      SELECT c.id AS "classId", c.name, t.name AS teacher, e.status = 'PENDING' AS pending,
             (SELECT "passwordHash" IS NOT NULL FROM "User" WHERE id = ${user.id}) AS "hasPassword"
      FROM "Enrollment" e JOIN "Class" c ON c.id = e."classId" JOIN "User" t ON t.id = c."teacherId"
      WHERE e."userId" = ${user.id} ORDER BY e."joinedAt"`
  ).map((c) => ({ classId: c.classId, pending: c.pending, hasPassword: c.hasPassword, class: { name: c.name, teacher: { name: c.teacher } } }));
  // A student who signed up through Telegram has no password: disconnecting it would lock them out.
  const telegramOnly = !classes.some((c) => c.hasPassword);
  return (
    <>
      <PageHeader kicker="Account" title="Settings" subtitle={user.email ?? "Logged in with Telegram"} action={<LogoutButton />} />
      <div className="max-w-2xl space-y-4">
        <Card>
          <p className="font-medium">Target band</p>
          <TargetBandPicker value={user.targetBand} />
        </Card>
        <Card>
          <p className="font-medium">Uzbek translations</p>
          <UzbekToggle on={user.uzbekGlosses} />
        </Card>
        <Card>
          <p className="font-medium">My classes</p>
          {classes.length ? (
            <ul className="mt-1">
              {classes.map((c) => (
                <li key={c.classId}>
                  {c.class.name} <span className="text-muted">· {c.class.teacher.name}</span>
                  {c.pending && <span className="ml-1.5 text-sm text-warn">· waiting for approval</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-muted">You are not in a class yet.</p>
          )}
          <JoinClassForm />
        </Card>
        <TelegramCard user={user} role="STUDENT" canDisconnect={!telegramOnly} />
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
