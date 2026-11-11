import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE, decryptSession, encryptSession, sessionMaxAge, type SessionPayload } from "./session";

/**
 * Whether the browser reached us over HTTPS. Netlify passes this on in x-forwarded-proto; locally, Next.js fills it in
 * from the connection itself.
 */
async function overHttps() {
  return (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

export async function createSession(payload: SessionPayload) {
  const token = await encryptSession(payload);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure only over HTTPS: a browser drops a Secure cookie sent over plain http (e.g. http://192.168.x.x:3000),
    // and the student would land back on the log-in page after every click.
    secure: await overHttps(),
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge,
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed cookie, checked once per request however many components ask. */
export const getSession = cache(async () => decryptSession((await cookies()).get(SESSION_COOKIE)?.value));

/**
 * The account behind the session: one query per request, shared by the sidebar, the page and its parts, and
 * without the password hash, which nothing outside log in needs.
 */
export const currentUser = cache((userId: string) =>
  db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, uzbekGlosses: true, telegramCode: true, telegramChatId: true },
  }),
);

export async function requireUser(role?: "STUDENT" | "TEACHER") {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await currentUser(session.userId);
  if (!user) redirect("/auth/signout");
  if (role && user.role !== role) redirect(user.role === "TEACHER" ? "/teacher" : "/student");
  return user;
}

export const requireStudent = () => requireUser("STUDENT");

export const requireTeacher = () => requireUser("TEACHER");

/** Admin teachers upload Anki decks for the whole system. Set ADMIN_EMAILS="a@school.uz,b@school.uz" in .env. */
export function isAdmin(email: string) {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export async function requireAdmin() {
  const user = await requireTeacher();
  if (!isAdmin(user.email)) redirect("/teacher");
  return user;
}
