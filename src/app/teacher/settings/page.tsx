import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoutButton } from "@/components/logout-button";
import { TelegramCard } from "@/components/telegram-card";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { isAdmin, requireTeacher } from "@/lib/auth";
import { AddTeacherForm } from "../teacher-forms";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const user = await requireTeacher();
  const admin = isAdmin(user.email);
  return (
    <>
      <PageHeader kicker="Account" title="Settings" subtitle={user.email} action={<LogoutButton />} />
      <div className="max-w-2xl space-y-4">
        <TelegramCard user={user} role="TEACHER" />
        {admin && (
          <Card>
            <p className="font-semibold">Add a teacher</p>
            <p className="mt-1 mb-3 text-sm text-muted">
              There is no public sign-up. Teachers log in with the email and password you set here; students join through the Telegram bot with a class
              code and their teacher approves them.
            </p>
            <AddTeacherForm />
          </Card>
        )}
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
