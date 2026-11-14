/**
 * The fortress: each student's castle, built from their level. Stages are far apart on purpose (a steady student
 * earns about 35 XP a day, so a Fort is roughly three months of daily work and the Citadel more than a year). Missed
 * days cost XP, but never a stage: XP cannot fall below where the current stage began, so a built castle stands.
 * The next stages are always in sight. Pure functions, shared by server pages and tests.
 */
import { fmtXp, levelOf } from "./xp";

export type Stage = { key: string; name: string; level: number; blurb: string };

/** In order. `level` is the level that completes the stage; XP for level L starts at 40·L·(L−1). */
export const STAGES: Stage[] = [
  { key: "camp", name: "Camp", level: 1, blurb: "A tent and a fire. Every fortress starts here." },
  { key: "palisade", name: "Palisade", level: 3, blurb: "A wooden fence: your first real defence." },
  { key: "watchtower", name: "Watchtower", level: 5, blurb: "Now you can see what is coming." },
  { key: "tower", name: "Stone Tower", level: 7, blurb: "Stone instead of wood. It will not burn." },
  { key: "fort", name: "Fort", level: 9, blurb: "Walls and a gate. A place worth defending." },
  { key: "keep", name: "Keep", level: 12, blurb: "A great hall behind the walls." },
  { key: "castle", name: "Castle", level: 15, blurb: "Towers on every side." },
  { key: "fortress", name: "Fortress", level: 18, blurb: "Double walls, banners on every tower." },
  { key: "citadel", name: "Citadel", level: 22, blurb: "Golden roofs. Very few students ever build one." },
];

/** The XP at which a level starts. */
export const xpForLevel = (level: number) => 40 * level * (level - 1);

/** Index into STAGES of the highest stage this level has built. */
export function stageIndex(level: number): number {
  let i = 0;
  while (i + 1 < STAGES.length && level >= STAGES[i + 1]!.level) i++;
  return i;
}

/** The XP at which the stage this much XP is in began: the lowest penalties can take the student back to. */
export const stageFloorXp = (xp: number) => xpForLevel(STAGES[stageIndex(levelOf(xp).level)]!.level);

export type Fortress = {
  stage: number;
  current: Stage;
  /** the next stages, nearest first (at most three), with the XP still needed for each */
  ahead: (Stage & { index: number; xpLeft: number })[];
  /** progress from the current stage to the next, 0–1 (1 at the last stage) */
  toNext: number;
};

export function fortressOf(xp: number): Fortress {
  const { level } = levelOf(xp);
  const stage = stageIndex(level);
  const ahead = STAGES.slice(stage + 1, stage + 4).map((s, i) => ({ ...s, index: stage + 1 + i, xpLeft: Math.max(0, xpForLevel(s.level) - xp) }));
  const from = xpForLevel(STAGES[stage]!.level);
  const next = STAGES[stage + 1];
  const toNext = next ? Math.min(1, Math.max(0, (xp - from) / (xpForLevel(next.level) - from))) : 1;
  return { stage, current: STAGES[stage]!, ahead, toNext };
}

/**
 * Crowns: weeks a student finished first in their class league. A week counts only when at least two classmates
 * earned XP in it (a lone student would crown themselves every week), and a tie crowns everyone tied for first.
 * `weeks` is one row per student per finished week with that week's XP.
 */
export function crownsFrom(weeks: { userId: string; week: string; xp: number }[]): Map<string, number> {
  const byWeek = new Map<string, { userId: string; xp: number }[]>();
  for (const w of weeks) if (w.xp > 0) byWeek.set(w.week, [...(byWeek.get(w.week) ?? []), w]);
  const crowns = new Map<string, number>();
  for (const rows of byWeek.values()) {
    if (rows.length < 2) continue;
    const top = Math.max(...rows.map((r) => r.xp));
    for (const r of rows) if (r.xp === top) crowns.set(r.userId, (crowns.get(r.userId) ?? 0) + 1);
  }
  return crowns;
}

export type Rival = { name: string; xp: number };

/**
 * The one line that makes a league personal: how far to the person just above you, or, when you lead, how far ahead
 * of the person behind you are.
 */
export function rivalLine(rows: { name: string; xp: number; you: boolean }[]): { kind: "chase" | "lead" | "alone"; text: string } {
  const at = rows.findIndex((r) => r.you);
  if (at < 0 || rows.length < 2) return { kind: "alone", text: "Invite classmates to start a league." };
  const me = rows[at]!;
  if (at === 0) {
    const second = rows[1]!;
    const lead = me.xp - second.xp;
    return lead > 0
      ? { kind: "lead", text: `You lead by ${fmtXp(lead)} XP over ${first(second.name)}. Hold the top spot.` }
      : { kind: "chase", text: `Tied with ${first(second.name)}. Any XP puts you in front.` };
  }
  const above = rows[at - 1]!;
  return { kind: "chase", text: `${fmtXp(above.xp - me.xp + 0.1)} XP to pass ${first(above.name)} for #${at}.` };
}

const first = (name: string) => name.split(/\s+/)[0] ?? name;
