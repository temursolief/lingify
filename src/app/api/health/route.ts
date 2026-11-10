import { connection } from "next/server";
import { db } from "@/lib/db";

/**
 * For the host's health check (Railway: Settings → Deploy → Healthcheck path): 200 once the server answers and the
 * database is reachable, so a new release only takes over when it can serve students.
 */
export async function GET() {
  await connection();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
