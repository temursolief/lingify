"use client";

import { useOffline } from "next/offline";

/** Shown across the open pane when the connection drops. A plain <a> so the service worker can serve the offline page. */
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div role="status" className="flex shrink-0 items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-sm text-warn">
      <span>No internet connection. Waiting to reconnect…</span>
      <a href="/offline" className="font-medium text-warn underline">Read and review offline</a>
    </div>
  );
}
