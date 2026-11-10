"use client";

import { useEffect, useState } from "react";
import { clearOfflineData, loadPack } from "@/lib/offline-store";
import { syncNow, type SyncResult } from "@/lib/offline-sync";

const REFRESH_MS = 15 * 60_000;

export function OfflineSyncStatus({ userId }: { userId: string }) {
  const [state, setState] = useState<SyncResult | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      // A different student on this laptop: drop the previous one's copy before saving a new one.
      const existing = await loadPack().catch(() => undefined);
      if (existing && existing.userId !== userId) await clearOfflineData();
      const result = await syncNow();
      if (alive) setState(result);
    };
    run();
    window.addEventListener("online", run);
    const timer = setInterval(run, REFRESH_MS);
    return () => {
      alive = false;
      window.removeEventListener("online", run);
      clearInterval(timer);
    };
  }, [userId]);

  if (!state) return <p className="px-2.5 pt-1.5 text-xs text-muted">Saving an offline copy…</p>;
  const texts = state.pack?.texts.length ?? 0;
  const words = state.pack?.review.cards.length ?? 0;
  return (
    <p className="px-2.5 pt-1.5 text-xs text-muted" title="These texts and words work without internet">
      {state.waiting > 0
        ? `${state.waiting} offline answer${state.waiting === 1 ? "" : "s"} waiting to sync`
        : state.pack
          ? <>Works offline: {texts} text{texts === 1 ? "" : "s"}, {words} review word{words === 1 ? "" : "s"} · <a href="/offline">open</a></>
          : "Offline copy not saved yet"}
    </p>
  );
}
