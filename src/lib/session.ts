import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "lingify_session";
/** A study app is opened daily on the same device; a student is not asked to log in again every week. */
const SESSION_DAYS = 30;

export type SessionPayload = {
  userId: string;
  role: "STUDENT" | "TEACHER";
  name: string;
};

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  // A short secret can be guessed, and anyone who guesses it can sign in as any teacher.
  if (process.env.NODE_ENV === "production" && secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function encryptSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export async function decryptSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || (payload.role !== "STUDENT" && payload.role !== "TEACHER")) return null;
    return { userId: payload.userId, role: payload.role, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}

export const sessionMaxAge = SESSION_DAYS * 24 * 60 * 60;
