import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayOf } from "@/lib/time";

const MAX_SECONDS_PER_BEAT = 60;

const schema = z.object({
  activity: z.enum(["READING", "QUIZ", "VOCAB", "GRAMMAR", "REVIEW", "PLACEMENT"]),
  seconds: z.number().int().positive().max(MAX_SECONDS_PER_BEAT),
  sessionId: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { activity, seconds, sessionId } = parsed.data;
  const now = new Date();
  const day = dayOf(now);
  const userId = session.userId;

  await db.$transaction([
    db.activityTime.upsert({
      where: { userId_day_activity: { userId, day, activity } },
      create: { userId, day, activity, seconds },
      update: { seconds: { increment: seconds } },
    }),
    db.user.update({ where: { id: userId }, data: { lastActiveAt: now } }),
    ...(sessionId && activity === "READING"
      ? [db.readingSession.updateMany({ where: { id: sessionId, userId, completedAt: null }, data: { activeSeconds: { increment: seconds } } })]
      : []),
  ]);
  return new Response(null, { status: 204 });
}
