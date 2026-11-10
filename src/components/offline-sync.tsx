import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { OfflineSyncStatus } from "./offline-sync-status";

async function Status() {
  const session = await getSession();
  return session ? <OfflineSyncStatus userId={session.userId} /> : null;
}

/** Keeps an offline copy of the next texts and review words fresh, and shows one quiet line about it. */
export function OfflineSync() {
  return (
    <Suspense fallback={null}>
      <Status />
    </Suspense>
  );
}
