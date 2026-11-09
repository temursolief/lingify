import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "lingify_session";
const SESSION_DAYS = 7;

export type SessionPayload = {
  userId: string;
  role: "STUDENT" | "TEACHER";
  name: string;
};

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
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
