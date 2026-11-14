"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { createSession, deleteSession, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { blockedFor, clearFailures, recordFailure } from "@/lib/rate-limit";
import { botLink } from "@/lib/telegram";
import { deviceName, LOGIN_COOKIE, LOGIN_MINUTES, mayLogIn, redeemLinkLogin, startWebLogin } from "@/lib/telegram-login";

export type AuthState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

/**
 * "Log in with Telegram", step one: a secret for this browser (httpOnly cookie) and the t.me link that carries the
 * matching code. The page then polls /api/auth/telegram until the bot reports the person confirmed.
 */
export async function startTelegramLogin(): Promise<{ link: string } | { error: string }> {
  if (!process.env.TELEGRAM_BOT_USERNAME) return { error: "Telegram log-in is not set up on this server yet." };
  const { secret, code } = await startWebLogin(deviceName((await headers()).get("user-agent")));
  (await cookies()).set(LOGIN_COOKIE, secret, {
    httpOnly: true,
    secure: (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim() === "https",
    sameSite: "lax",
    path: "/",
    maxAge: LOGIN_MINUTES * 60,
  });
  return { link: botLink(`login_${code}`) };
}

/** A one-time link from the bot: logs that account in on this device. */
export async function logInWithLink(code: string): Promise<{ error: string } | undefined> {
  if (typeof code !== "string" || !code) return { error: "This link is not valid." };
  const user = await redeemLinkLogin(code);
  if (!user) return { error: "This link has expired or was already used. Send /login to the bot for a new one." };
  await createSession({ userId: user.id, role: user.role, name: user.name });
  redirect(user.role === "TEACHER" ? "/teacher" : "/student");
}

const teacherSchema = z.object({
  name: z.string().trim().min(2, "Enter the teacher's name.").max(80),
  email: z.email("Enter a valid email address.").trim().toLowerCase().max(200),
  // bcrypt reads 72 bytes at most; a huge password would only keep the server busy.
  password: z.string().min(8, "Use at least 8 characters.").max(200, "Use at most 200 characters."),
});

/** There is no public sign-up: an admin teacher adds teacher accounts (students come in through Telegram). */
export type TeacherState = { error?: string; ok?: string } | undefined;

export async function createTeacher(_: TeacherState, formData: FormData): Promise<TeacherState> {
  await requireAdmin();
  const parsed = teacherSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { name, email, password } = parsed.data;
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return { error: "An account with this email already exists." };
  const created = await db.user.create({ data: { name, email, role: "TEACHER", passwordHash: await bcrypt.hash(password, 10) } }).catch(() => null);
  if (!created) return { error: "An account with this email already exists." };
  return { ok: `Teacher account created for ${name}. They log in with ${email} and the password you chose.` };
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(200),
  password: z.string().min(1).max(200),
});

const WRONG = { error: "Email or password is incorrect." };
const LOGIN_TRIES = 8;
const LOGIN_WINDOW_MS = 10 * 60_000;
/** Compared against when the email is unknown, so a wrong email takes as long as a wrong password. */
let noUserHash: Promise<string> | undefined;

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return WRONG;
  const { email, password } = parsed.data;
  // Guessing passwords for one account is slowed down, whoever is asking.
  const key = `login:${email}`;
  const wait = blockedFor(key, LOGIN_TRIES);
  if (wait) return { error: `Too many tries. Wait ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""} and try again.` };
  const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true, name: true, passwordHash: true } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? (await (noUserHash ??= bcrypt.hash("no such account", 10))));
  if (!user || !ok) {
    recordFailure(key, LOGIN_WINDOW_MS);
    return WRONG;
  }
  clearFailures(key);
  if (!(await mayLogIn(user.id))) return { error: "Your teacher has not approved you yet. You can log in once they do." };
  await createSession({ userId: user.id, role: user.role, name: user.name });
  redirect(user.role === "TEACHER" ? "/teacher" : "/student");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
