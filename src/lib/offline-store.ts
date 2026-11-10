"use client";

import { emptyQueue, type OfflinePack, type OfflineQueue } from "./offline-types";

/** A tiny IndexedDB key-value store: the offline pack, its ETag and the queue of things done offline. */
const DB_NAME = "lingify";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

const get = <T>(key: string) => run<T | undefined>("readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
const put = (key: string, value: unknown) => run("readwrite", (s) => s.put(value, key));

export const loadPack = () => get<OfflinePack>("pack");
export const savePack = (pack: OfflinePack, etag: string | null) => Promise.all([put("pack", pack), put("etag", etag)]);
export const loadEtag = () => get<string | null>("etag");
export const loadQueue = async () => (await get<OfflineQueue>("queue")) ?? emptyQueue();
export const saveQueue = (q: OfflineQueue) => put("queue", q);

/** Adds to the queue in one read-modify-write; a single tab writes at a time, which is all the app needs. */
export async function enqueue(update: (q: OfflineQueue) => void) {
  const q = await loadQueue();
  update(q);
  await saveQueue(q);
}

export const queueSize = (q: OfflineQueue) => q.reviews.length + q.lookups.length + q.finished.length;

/** On log out: nothing from this student stays on a shared laptop. */
export function clearOfflineData() {
  return new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
