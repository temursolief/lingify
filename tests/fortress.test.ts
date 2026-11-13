import { describe, expect, it } from "vitest";
import { crownsFrom, fortressOf, rivalLine, stageIndex, STAGES, xpForLevel } from "../src/lib/fortress";

describe("fortress stages", () => {
  it("starts at the camp and builds a stage at each threshold level", () => {
    expect(stageIndex(1)).toBe(0);
    expect(stageIndex(2)).toBe(1);
    expect(stageIndex(4)).toBe(2);
    expect(stageIndex(5)).toBe(3);
    expect(stageIndex(22)).toBe(STAGES.length - 1);
    expect(stageIndex(60)).toBe(STAGES.length - 1);
  });

  it("shows the next three stages with the XP each still needs", () => {
    const f = fortressOf(282); // level 3: watchtower
    expect(f.current.key).toBe("watchtower");
    expect(f.ahead.map((s) => s.key)).toEqual(["tower", "fort", "keep"]);
    expect(f.ahead[0]!.xpLeft).toBe(xpForLevel(5) - 282);
    expect(f.toNext).toBeGreaterThan(0);
    expect(f.toNext).toBeLessThan(1);
  });

  it("has nothing ahead at the last stage", () => {
    const f = fortressOf(xpForLevel(30));
    expect(f.current.key).toBe("citadel");
    expect(f.ahead).toEqual([]);
    expect(f.toNext).toBe(1);
  });
});

describe("crowns", () => {
  it("crowns the top of each week, ties included", () => {
    const crowns = crownsFrom([
      { userId: "a", week: "2026-11-02", xp: 300 },
      { userId: "b", week: "2026-11-02", xp: 200 },
      { userId: "a", week: "2026-11-09", xp: 100 },
      { userId: "b", week: "2026-11-09", xp: 100 },
    ]);
    expect(crowns.get("a")).toBe(2);
    expect(crowns.get("b")).toBe(1);
  });

  it("needs two students with XP in a week", () => {
    const crowns = crownsFrom([
      { userId: "a", week: "2026-11-02", xp: 300 },
      { userId: "b", week: "2026-11-02", xp: 0 },
    ]);
    expect(crowns.size).toBe(0);
  });
});

describe("rival line", () => {
  const rows = [
    { name: "Aziza K.", xp: 120, you: false },
    { name: "Jasur T.", xp: 80, you: true },
    { name: "Malika R.", xp: 40, you: false },
  ];
  it("tells a chaser how far to the person above", () => {
    expect(rivalLine(rows)).toEqual({ kind: "chase", text: "41 XP to pass Aziza for #1." });
  });
  it("tells the leader their lead", () => {
    expect(rivalLine(rows.map((r, i) => ({ ...r, you: i === 0 }))).text).toBe("You lead by 40 XP over Jasur. Hold the top spot.");
  });
});
