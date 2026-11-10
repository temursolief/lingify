"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, deleteSession } from "@/lib/auth";
import { db } from "@/lib/db";

export type AuthState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80),
  email: z.email("Please enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(8, "Use at least 8 characters."),
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
  if (await db.user.findUnique({ where: { email } })) {
    return { fieldErrors: { email: "An account with this email already exists." } };
  }
  const user = await db.user.create({
    data: { name, email, role, passwordHash: await bcrypt.hash(password, 10) },
  });
  await createSession({ userId: user.id, role: user.role, name: user.name });
  redirect(role === "TEACHER" ? "/teacher" : "/student");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string(),
});

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = loginSchema.parse(Object.fromEntries(formData));
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Email or password is incorrect." };
  }
  await createSession({ userId: user.id, role: user.role, name: user.name });
  redirect(user.role === "TEACHER" ? "/teacher" : "/student");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
