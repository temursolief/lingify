import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { OfflineSync } from "@/components/offline-sync";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      home="/student"
      settings="/student/settings"
      // Keeps the offline copy fresh on every page; its one line of status shows where there is room.
      end={
        <div className="hidden md:block">
          <OfflineSync />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
