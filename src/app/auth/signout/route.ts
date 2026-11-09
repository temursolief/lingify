import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/** Clears a session whose user no longer exists; otherwise the proxy and the page would redirect each other forever. */
export function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
