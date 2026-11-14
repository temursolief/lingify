import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Clears a session that can no longer be used: its user no longer exists (otherwise the proxy and the page would
 * redirect each other forever), or a student is no longer approved in any class (`?why=pending`, shown on log-in).
 */
export function GET(request: Request) {
  const why = new URL(request.url).searchParams.get("why");
  const response = NextResponse.redirect(new URL(why === "pending" ? "/login?why=pending" : "/login", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
