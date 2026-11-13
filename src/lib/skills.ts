import "server-only";
import { cache } from "react";
import { db } from "./db";
import { addDays } from "./time";

export type SkillBand = { band: number | null; delta: number | null; tries: number };

const avgBand = (bands: number[]) => (bands.length ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 2) / 2 : null);

/** Band now (average of the last three first tries) and how it moved against the three before the last 30 days. */
function bandOf(rows: { band: number | null; at: Date }[]): SkillBand {
  const scored = rows.filter((r) => r.band !== null) as { band: number; at: Date }[];
  const band = avgBand(scored.slice(0, 3).map((r) => r.band));
  const monthAgo = addDays(new Date(), -30);
  const before = avgBand(
    scored
      .filter((r) => r.at < monthAgo)
      .slice(0, 3)
      .map((r) => r.band),
  );
  return { band, delta: band !== null && before !== null ? band - before : null, tries: scored.length };
}

/** Reading and listening bands from first tries that still count (a required retake replaces the old one). */
export const skillBands = cache(async (userId: string) => {
  const where = { userId, invalidatedAt: null, firstSubmittedAt: { not: null } };
  const [reading, listening] = await Promise.all([
    db.passageAttempt.findMany({ where, orderBy: { firstSubmittedAt: "desc" }, select: { band: true, firstSubmittedAt: true } }),
    db.listeningAttempt.findMany({ where, orderBy: { firstSubmittedAt: "desc" }, select: { band: true, firstSubmittedAt: true } }),
  ]);
  return {
    reading: bandOf(reading.map((r) => ({ band: r.band, at: r.firstSubmittedAt! }))),
    listening: bandOf(listening.map((r) => ({ band: r.band, at: r.firstSubmittedAt! }))),
  };
});
