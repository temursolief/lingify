"use client";

import { emptyQueue, type OfflinePack, type OfflineQueue } from "./offline-types";

/** A tiny IndexedDB key-value store: the offline pack, its ETag and the queue of answers still to send. */
const DB_NAME = "lingify";
const STORE = "kv";

/** One connection for the page, opened on first use. Opening one per read made every flashcard answer slower. */
let connection: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const db = req.result;
      // Another tab is logging out or upgrading: let go, and reopen on the next use.
      db.onversionchange = db.onclose = () => {
        db.close();
        connection = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB is blocked"));
  }).catch((error) => {
    connection = null;
    throw error;
  });
  return connection;
}

/** Runs `work` in one transaction and resolves with its result once the transaction has been written. */
async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result: T;
    work(tx.objectStore(STORE), (value) => {
      result = value;
    });
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

const get = <T>(key: string) =>
  transact<T | undefined>("readonly", (s, done) => {
    const req = s.get(key);
    req.onsuccess = () => done(req.result as T | undefined);
  });

export const loadPack = () => get<OfflinePack>("pack");
export const loadEtag = () => get<string | null>("etag");
export const loadQueue = async () => (await get<OfflineQueue>("queue")) ?? emptyQueue();

/** The pack and its ETag are written together, so a half-saved copy is never read. */
export const savePack = (pack: OfflinePack, etag: string | null) =>
  transact<void>("readwrite", (s, done) => {
    s.put(pack, "pack");
    s.put(etag, "etag");
    done();
  });

/**
 * Changes the queue in a single read-modify-write transaction. IndexedDB runs these one after another, also across
 * tabs, so two quick answers (or an answer given while a sync is trimming the queue) can never overwrite each other.
 */
export const updateQueue = (change: (q: OfflineQueue) => OfflineQueue) =>
  transact<OfflineQueue>("readwrite", (s, done) => {
    const req = s.get("queue");
    req.onsuccess = () => {
      const next = change((req.result as OfflineQueue | undefined) ?? emptyQueue());
      s.put(next, "queue");
      done(next);
    };
  });

export const queueSize = (q: OfflineQueue) => q.reviews.length;

/** On log out: nothing from this student stays on a shared device. */
export async function clearOfflineData() {
  const db = await connection?.catch(() => null);
  db?.close();
  connection = null;
  return new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
