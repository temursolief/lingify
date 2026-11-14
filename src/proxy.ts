import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decryptSession } from "@/lib/session";

const PUBLIC_ONLY = ["/", "/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await decryptSession(request.cookies.get(SESSION_COOKIE)?.value);
  const home = session?.role === "TEACHER" ? "/teacher" : "/student";

  if (PUBLIC_ONLY.includes(pathname)) {
    return session ? NextResponse.redirect(new URL(home, request.url)) : NextResponse.next();
  }

  const area = pathname.startsWith("/teacher") ? "TEACHER" : pathname.startsWith("/student") ? "STUDENT" : null;
  if (area) {
    if (!session) return NextResponse.redirect(new URL("/login", request.url));
    if (session.role !== area) return NextResponse.redirect(new URL(home, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/student/:path*", "/teacher/:path*"],
};
