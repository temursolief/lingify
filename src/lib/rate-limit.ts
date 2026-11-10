import "server-only";

/**
 * A small in-memory limiter for log in: at most `limit` failures per key in `windowMs`. It lives in this server
 * process, which is enough for one school on one server. Behind several servers, each keeps its own count.
 */
const MAX_KEYS = 5000;
const failures = new Map<string, { count: number; resetAt: number }>();

function entry(key: string, now: number) {
  const e = failures.get(key);
  if (e && e.resetAt > now) return e;
  failures.delete(key);
  return null;
}

/** Seconds to wait if the key is blocked, otherwise 0. */
export function blockedFor(key: string, limit: number, now = Date.now()): number {
  const e = entry(key, now);
  return e && e.count >= limit ? Math.ceil((e.resetAt - now) / 1000) : 0;
}

export function recordFailure(key: string, windowMs: number, now = Date.now()) {
  const e = entry(key, now);
  if (e) {
    e.count++;
    return;
  }
  if (failures.size >= MAX_KEYS) {
    // Drop what has expired; if the map is still full, the oldest keys go first.
    for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
    for (const k of failures.keys()) {
      if (failures.size < MAX_KEYS) break;
      failures.delete(k);
    }
  }
  failures.set(key, { count: 1, resetAt: now + windowMs });
}

export function clearFailures(key: string) {
  failures.delete(key);
}
