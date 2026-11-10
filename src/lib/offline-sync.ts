"use client";

import { loadEtag, loadPack, loadQueue, queueSize, savePack, saveQueue } from "./offline-store";
import type { OfflinePack } from "./offline-types";

let running: Promise<SyncResult> | null = null;

export type SyncResult = { ok: boolean; pack: OfflinePack | undefined; waiting: number };

/** Sends what was done offline, then refreshes the offline copy. Only one sync runs at a time. */
export function syncNow(): Promise<SyncResult> {
  running ??= doSync().finally(() => {
    running = null;
  });
  return running;
}

async function doSync(): Promise<SyncResult> {
  try {
    const sent = await loadQueue();
    if (queueSize(sent)) {
      const res = await fetch("/api/offline/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sent) });
      if (!res.ok) throw new Error(`sync ${res.status}`);
      // Anything added while the request was in flight stays for next time.
      const now = await loadQueue();
      await saveQueue({
        reviews: now.reviews.slice(sent.reviews.length),
        lookups: now.lookups.slice(sent.lookups.length),
        finished: now.finished.slice(sent.finished.length),
      });
    }
    const etag = await loadEtag();
    const res = await fetch("/api/offline/pack", { headers: etag ? { "If-None-Match": etag } : {} });
    if (res.status === 200) await savePack(await res.json(), res.headers.get("ETag"));
    else if (res.status !== 304) throw new Error(`pack ${res.status}`);
    return { ok: true, pack: await loadPack(), waiting: queueSize(await loadQueue()) };
  } catch {
    return { ok: false, pack: await loadPack().catch(() => undefined), waiting: queueSize(await loadQueue().catch(() => ({ reviews: [], lookups: [], finished: [] }))) };
  }
}
