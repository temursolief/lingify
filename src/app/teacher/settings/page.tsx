import type { Metadata } from "next";
import { Suspense } from "react";
import { TelegramCard } from "@/components/telegram-card";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const user = await requireTeacher();
  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="Settings" />
      <TelegramCard user={user} role="TEACHER" />
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
