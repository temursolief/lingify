import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoutButton } from "@/components/logout-button";
import { TelegramCard } from "@/components/telegram-card";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const user = await requireTeacher();
  return (
    <>
      <PageHeader kicker="Account" title="Settings" subtitle={user.email} action={<LogoutButton />} />
      <div className="max-w-2xl space-y-4">
        <TelegramCard user={user} role="TEACHER" />
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
