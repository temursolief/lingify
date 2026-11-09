import "server-only";
import { db } from "./db";
import { addDays } from "./time";

export type Flag = { kind: "inactive" | "comprehension" | "stalled"; label: string; detail: string };

export const INACTIVE_DAYS = 7;
export const STALLED_DAYS = 14;
const LOW_COMPREHENSION = 0.6;
const DROP = 0.2;

export async function flagsFor(userId: string, now = new Date()): Promise<Flag[]> {
  const [user, recentQuizzes, recentLearned] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { lastActiveAt: true, createdAt: true } }),
    db.readingSession.findMany({
      where: { userId, quizScore: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 6,
      select: { quizScore: true },
    }),
    db.lemmaState.count({
      where: { userId, status: "KNOWN", source: { not: "PLACEMENT" }, knownAt: { gte: addDays(now, -STALLED_DAYS) } },
    }),
  ]);

  const flags: Flag[] = [];
  const lastActive = user.lastActiveAt ?? user.createdAt;
  const idleDays = Math.floor((now.getTime() - lastActive.getTime()) / 86_400_000);
  if (idleDays >= INACTIVE_DAYS) {
    flags.push({ kind: "inactive", label: "Inactive", detail: `No activity for ${idleDays} days` });
  }

  const scores = recentQuizzes.map((q) => q.quizScore!);
  const last3 = scores.slice(0, 3);
  const prev3 = scores.slice(3, 6);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  if (last3.length >= 3 && avg(last3) < LOW_COMPREHENSION) {
    flags.push({ kind: "comprehension", label: "Low comprehension", detail: `Last 3 quizzes average ${Math.round(avg(last3) * 100)}%` });
  } else if (last3.length >= 3 && prev3.length >= 3 && avg(prev3) - avg(last3) >= DROP) {
    flags.push({
      kind: "comprehension",
      label: "Comprehension falling",
      detail: `Down from ${Math.round(avg(prev3) * 100)}% to ${Math.round(avg(last3) * 100)}%`,
    });
  }

  const accountAgeDays = (now.getTime() - user.createdAt.getTime()) / 86_400_000;
  if (accountAgeDays >= STALLED_DAYS && recentLearned === 0) {
    flags.push({ kind: "stalled", label: "Vocabulary stalled", detail: `No new words learned in ${STALLED_DAYS} days` });
  }
  return flags;
}
