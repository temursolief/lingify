"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, deleteSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { blockedFor, clearFailures, recordFailure } from "@/lib/rate-limit";

export type AuthState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80),
  email: z.email("Please enter a valid email address.").trim().toLowerCase().max(200),
  // bcrypt reads 72 bytes at most; a huge password would only keep the server busy.
  password: z.string().min(8, "Use at least 8 characters.").max(200, "Use at most 200 characters."),
  role: z.enum(["STUDENT", "TEACHER"]),
});

export async function signup(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const { name, email, password, role } = parsed.data;
  const taken = { fieldErrors: { email: "An account with this email already exists." } };
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return taken;
  const passwordHash = await bcrypt.hash(password, 10);
  // Two sign-ups with one email at the same moment: the second hits the unique email and gets the same message.
  const user = await db.user.create({ data: { name, email, role, passwordHash }, select: { id: true, role: true, name: true } }).catch(() => null);
  if (!user) return taken;
  await createSession({ userId: user.id, role: user.role, name: user.name });
  redirect(role === "TEACHER" ? "/teacher" : "/student");
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
  await createSession({ userId: user.id, role: user.role, name: user.name });
  redirect(user.role === "TEACHER" ? "/teacher" : "/student");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
