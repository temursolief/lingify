/**
 * Recounts every student's XpDay rollup from scratch, in batches. Pages already recount a student on their next view
 * when they are marked (the migration marks everyone), so this is for repair: after a manual data fix, or if a write
 * path ever forgot to call markXpDirty. Safe to run any time, also while the app is live.
 * Usage: npm run xp:rebuild
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { refreshXp } from "../src/lib/gamification";

const BATCH = 50;

async function main() {
  const students = await db.user.findMany({ where: { role: "STUDENT" }, select: { id: true }, orderBy: { id: "asc" } });
  for (let i = 0; i < students.length; i += BATCH) {
    const ids = students.slice(i, i + BATCH).map((s) => s.id);
    await db.user.updateMany({ where: { id: { in: ids } }, data: { xpDirtyFrom: new Date(0), xpDirtySeq: { increment: 1 } } });
    await refreshXp(ids);
    console.log(`xp: ${Math.min(i + BATCH, students.length)}/${students.length}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
