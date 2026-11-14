import { cookies } from "next/headers";
import { createSession } from "@/lib/auth";
import { LOGIN_COOKIE, pollWebLogin } from "@/lib/telegram-login";

/**
 * The login page asks this every couple of seconds while the student confirms in Telegram. Only the browser that
 * started the log-in has the cookie; once the bot reports a confirmation, this request sets the session.
 */
export async function POST() {
  const jar = await cookies();
  const secret = jar.get(LOGIN_COOKIE)?.value;
  if (!secret) return Response.json({ status: "expired" });
  const state = await pollWebLogin(secret);
  if (state.status !== "done") return Response.json({ status: state.status });
  jar.delete(LOGIN_COOKIE);
  await createSession({ userId: state.user.id, role: state.user.role, name: state.user.name });
  return Response.json({ status: "done", home: state.user.role === "TEACHER" ? "/teacher" : "/student" });
}
