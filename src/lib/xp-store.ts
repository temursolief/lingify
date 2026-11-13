import "server-only";
import { db } from "./db";

/**
 * Something that changes a student's XP happened at `from`: a first try, a proof, a tag, card reviews, homework done
 * or flagged, a retake, a deleted homework or card. Their XpDay rows from that day on are recounted the next time a
 * page reads them (see `refreshXp` in gamification.ts). Two small UPDATEs, so call it after every such write; a missed
 * call only leaves the rollup stale until the next mark or `npm run xp:rebuild`.
 *
 * The earliest mark wins, and the sequence number is bumped every time, so a recount running while a new change
 * arrives does not clear the marker and lose that change.
 */
export async function markXpDirty(userIds: string | string[], from: Date) {
  const ids = typeof userIds === "string" ? [userIds] : [...new Set(userIds)];
  if (!ids.length) return;
  await db.$transaction([
    db.user.updateMany({ where: { id: { in: ids }, OR: [{ xpDirtyFrom: null }, { xpDirtyFrom: { gt: from } }] }, data: { xpDirtyFrom: from } }),
    db.user.updateMany({ where: { id: { in: ids } }, data: { xpDirtySeq: { increment: 1 } } }),
  ]);
}
