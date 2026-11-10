"use client";

import { loadEtag, loadPack, loadQueue, queueSize, savePack, updateQueue } from "./offline-store";
import type { OfflinePack, OfflineQueue } from "./offline-types";

type Review = OfflineQueue["reviews"][number];

export type SyncResult = { ok: boolean; pack: OfflinePack | undefined; waiting: number };

const keyOf = (r: Review) => `${r.cardId}|${r.at}`;

/** Answers given while IndexedDB is unavailable (private windows): kept for this page only. */
let memory: Review[] = [];

async function post(reviews: Review[]) {
  const res = await fetch("/api/offline/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviews }), keepalive: reviews.length < 100 });
  if (!res.ok) throw new Error(`sync ${res.status}`);
}

/** Only one tab sends at a time (Web Locks), so the same answers are not posted twice at once. */
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  return typeof navigator !== "undefined" && navigator.locks ? (navigator.locks.request("lingify-sync", work) as Promise<T>) : work();
}

async function drain() {
  if (memory.length) {
    const sent = memory;
    await post(sent);
    memory = memory.filter((r) => !sent.includes(r));
  }
  // Answers given while a request is in flight go out with the next one.
  for (;;) {
    const sent = await loadQueue().catch(() => null);
    if (!sent || !queueSize(sent)) return;
    await post(sent.reviews);
    const gone = new Set(sent.reviews.map(keyOf));
    await updateQueue((q) => ({ ...q, reviews: q.reviews.filter((r) => !gone.has(keyOf(r))) }));
  }
}

let sending: Promise<boolean> | null = null;

/** Sends the queued answers. Resolves true when nothing is left to send. One send runs at a time. */
export function sendQueue(): Promise<boolean> {
  sending ??= exclusive(drain)
    .then(() => true, () => false)
    .finally(() => {
      sending = null;
    });
  return sending;
}

/** Keeps a flashcard answer on the device (it survives a closed tab or a lost connection) and sends it. */
export async function recordReview(review: Review): Promise<boolean> {
  try {
    await updateQueue((q) => ({ ...q, reviews: [...q.reviews, review] }));
  } catch {
    memory.push(review);
  }
  // A send already running may have read the queue before this answer: go again once it ends.
  if (sending) await sending;
  return sendQueue();
}

async function refreshPack() {
  const etag = await loadEtag();
  const res = await fetch("/api/offline/pack", { headers: etag ? { "If-None-Match": etag } : {} });
  if (res.status === 304) return;
  if (res.status !== 200) throw new Error(`pack ${res.status}`);
  const pack = (await res.json()) as OfflinePack;
  // An answer given during the download is not in this pack yet: keep the local copy, the next sync replaces it.
  if (!queueSize(await loadQueue())) await savePack(pack, res.headers.get("ETag"));
}

let syncing: Promise<SyncResult> | null = null;

/** Sends what is queued, then refreshes the offline copy. Only one sync runs at a time. */
export function syncNow(): Promise<SyncResult> {
  syncing ??= (async () => {
    let ok = false;
    try {
      ok = await sendQueue();
      if (ok) await refreshPack();
    } catch {
      ok = false;
    }
    const [pack, queue] = await Promise.all([loadPack().catch(() => undefined), loadQueue().catch(() => null)]);
    return { ok, pack, waiting: (queue ? queueSize(queue) : 0) + memory.length };
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
