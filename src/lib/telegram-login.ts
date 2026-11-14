import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { appUrl } from "./telegram";

/**
 * Logging in with Telegram, two ways:
 *
 * 1. From the website. The browser gets a random secret in an httpOnly cookie and opens t.me/<bot>?start=login_<code>.
 *    The bot asks the person to confirm ("Yes, it's me"); the browser, polling with its cookie, is then logged in.
 *    The code alone is useless: only the browser holding the secret can collect the session, and nothing happens
 *    until the Telegram account it belongs to confirms. Both expire after LOGIN_MINUTES and work once.
 * 2. From the bot. A student who taps "Open Lingify" gets a one-time link; only their chat ever sees it.
 */
export const LOGIN_MINUTES = 10;
export const LOGIN_COOKIE = "lingify_tg_login";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const random = (bytes: number) => randomBytes(bytes).toString("base64url");
const expiry = () => new Date(Date.now() + LOGIN_MINUTES * 60_000);

/** May this account log in? Teachers always; students only with at least one class that approved them. */
export async function mayLogIn(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true, _count: { select: { enrollments: { where: { status: "APPROVED" } } } } } });
  return !!u && (u.role === "TEACHER" || u._count.enrollments > 0);
}

/** "Chrome on Windows" from a User-Agent header: enough for a person to recognise their own device. */
export function deviceName(userAgent: string | null) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "a browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "an unknown device";
  return `${browser} on ${os}`;
}

/** A website log-in: the secret for the browser's cookie and the code for the t.me link. */
export async function startWebLogin(device: string | null = null) {
  const secret = random(32);
  const code = random(18);
  // Old tokens are of no use to anyone: clear them out now and then.
  await db.loginToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } });
  await db.loginToken.create({ data: { code, secretHash: sha256(secret), expiresAt: expiry(), device } });
  return { secret, code };
}

export type WebLoginState =
  | { status: "waiting" | "unknown" | "pending" | "denied" | "expired" }
  | { status: "done"; user: { id: string; role: "STUDENT" | "TEACHER"; name: string } };

/**
 * What the browser holding this secret should show. A confirmed log-in is collected exactly once: the row is switched
 * to USED in the same statement that checks it, so two polls arriving together cannot both get a session.
 */
export async function pollWebLogin(secret: string): Promise<WebLoginState> {
  const row = await db.loginToken.findUnique({ where: { secretHash: sha256(secret) } });
  if (!row || row.expiresAt < new Date() || row.status === "USED") return { status: "expired" };
  if (row.status === "DENIED") return { status: "denied" };
  if (row.status === "WAITING") return { status: row.note === "unknown" || row.note === "pending" ? row.note : "waiting" };
  const taken = await db.loginToken.updateMany({ where: { id: row.id, status: "CONFIRMED" }, data: { status: "USED" } });
  if (!taken.count || !row.userId) return { status: "expired" };
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { id: true, role: true, name: true } });
  if (!user || !(await mayLogIn(user.id))) return { status: "pending" };
  return { status: "done", user };
}

/**
 * The bot's side of a website log-in: the pending row for a t.me code, claimed for the account of the chat that opened
 * it first. A code opened from a second chat is refused, so only one Telegram account can ever confirm it.
 */
export async function claimWebLogin(code: string, userId: string | null) {
  const row = await db.loginToken.findUnique({ where: { code } });
  if (!row || !row.secretHash || row.status !== "WAITING" || row.expiresAt < new Date()) return null;
  if (!userId) return row;
  if (row.userId && row.userId !== userId) return null;
  if (!row.userId) {
    const claimed = await db.loginToken.updateMany({ where: { id: row.id, userId: null, status: "WAITING" }, data: { userId } });
    if (!claimed.count) return null;
  }
  return row;
}

/** Tells the waiting browser why it cannot log in yet: not registered, or registered but not approved. */
export async function noteWebLogin(id: string, note: "unknown" | "pending") {
  await db.loginToken.updateMany({ where: { id, status: "WAITING" }, data: { note } });
}

/** The person pressed "Yes, it's me" (or "No") in Telegram: counts only for the account that claimed the log-in. */
export async function answerWebLogin(id: string, userId: string, yes: boolean) {
  const done = await db.loginToken.updateMany({
    where: { id, userId, status: "WAITING", expiresAt: { gt: new Date() } },
    data: { status: yes ? "CONFIRMED" : "DENIED" },
  });
  return done.count > 0;
}

/** A one-time log-in link for the bot to send to an account's own chat. */
export async function linkLogin(userId: string) {
  const code = random(32);
  await db.loginToken.create({ data: { code, userId, status: "CONFIRMED", expiresAt: expiry() } });
  return appUrl(`/auth/telegram?t=${code}`);
}

/** Uses a link from the bot: the account it was made for, or null if it is used, expired or not a link. */
export async function redeemLinkLogin(code: string) {
  const taken = await db.loginToken.updateMany({ where: { code, secretHash: null, status: "CONFIRMED", expiresAt: { gt: new Date() } }, data: { status: "USED" } });
  if (!taken.count) return null;
  const row = await db.loginToken.findUnique({ where: { code }, select: { user: { select: { id: true, role: true, name: true } } } });
  if (!row?.user || !(await mayLogIn(row.user.id))) return null;
  return row.user;
}
