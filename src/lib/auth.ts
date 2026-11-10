import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE, decryptSession, encryptSession, sessionMaxAge, type SessionPayload } from "./session";

export async function createSession(payload: SessionPayload) {
  const token = await encryptSession(payload);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge,
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession() {
  return decryptSession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireUser(role?: "STUDENT" | "TEACHER") {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await db.user.findUnique({ where: { id: session.userId } });
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
