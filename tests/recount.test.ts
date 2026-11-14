import { describe, expect, it } from "vitest";
import { stageFloorXp, xpForLevel } from "../src/lib/fortress";
import { dayOf } from "../src/lib/time";
import { recount } from "../src/lib/xp-recount";
import { toTenths, XP_LOSS, type XpEvent } from "../src/lib/xp";

const noon = (key: string) => new Date(`${key}T12:00:00Z`);
const day = (key: string) => dayOf(noon(key));
const prior = (key: string, xp: number, first = 0, proofs = 0, cards = 0) => ({ day: day(key), xp, first, proofs, cards });

describe("recount", () => {
  it("rolls earned XP into tenths and writes yesterday as the charged-through marker", () => {
    const events: XpEvent[] = [
      { kind: "first", at: noon("2026-11-10"), xp: 3 * 10 },
      { kind: "card", at: noon("2026-11-10"), xp: 0.2 },
      { kind: "card", at: noon("2026-11-10"), xp: 0.2 },
    ];
    const rows = recount("u", day("2026-11-10"), events, [], day("2026-11-12"));
    expect(rows.map((r) => r.day.toISOString().slice(0, 10))).toEqual(["2026-11-10", "2026-11-11"]);
    expect(rows[0]).toMatchObject({ xp: toTenths(30.4), first: 1, cards: 2 });
    // Nov 11 had nothing: idle (no real action) and no words.
    expect(rows[1]!.xp).toBe(-toTenths(XP_LOSS.idleDay + XP_LOSS.noWords));
  });

  it("charges nothing, and writes nothing, for a student who has never done anything", () => {
    expect(recount("u", day("2026-11-01"), [], [], day("2026-11-12"))).toEqual([]);
  });

  it("never takes the total below where the current stage began", () => {
    // 245 XP total: palisade began at 240. Three idle days would cost 39, but only 5 can go.
    const history = [prior("2026-11-01", toTenths(245), 1, 0, 12)];
    const rows = recount("u", day("2026-11-02"), [], history, day("2026-11-05"));
    const total = history[0]!.xp + rows.reduce((n, r) => n + r.xp, 0);
    expect(total).toBe(toTenths(stageFloorXp(245)));
    expect(total).toBe(toTenths(xpForLevel(3)));
  });

  it("keeps the streak walk consistent with earlier days that are not recounted", () => {
    // Active Nov 1 to Nov 3 (stored), recount from Nov 4: Nov 4 is idle, a streak with no shield still pays.
    const history = ["2026-11-01", "2026-11-02", "2026-11-03"].map((k) => prior(k, 300, 1, 1, 12));
    const rows = recount("u", day("2026-11-04"), [], history, day("2026-11-06"));
    expect(rows.find((r) => r.day.toISOString().startsWith("2026-11-04"))!.xp).toBe(-toTenths(XP_LOSS.idleDay + XP_LOSS.noWords));
  });

  it("charges a walked-out test against the day it happened", () => {
    const events: XpEvent[] = [
      { kind: "first", at: noon("2026-11-10"), xp: 15 },
      { kind: "left", at: noon("2026-11-10"), xp: -XP_LOSS.leftTest },
    ];
    const rows = recount("u", day("2026-11-10"), events, [], day("2026-11-10"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.xp).toBe(toTenths(15 - XP_LOSS.leftTest));
  });
});
