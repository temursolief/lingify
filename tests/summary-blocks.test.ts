import { describe, expect, it } from "vitest";
import { summaryBlocks } from "@/lib/summary-blocks";

describe("summaryBlocks", () => {
  it("keeps a plain summary as one text block", () => {
    expect(summaryBlocks("The ship was {{1}} and sank in {{2}}.")).toEqual([{ kind: "text", text: "The ship was {{1}} and sank in {{2}}." }]);
  });

  it("turns pipe lines into a table with a header row", () => {
    const text = "Time | Person\n11:39 | {{1}}\n{{2}} | Andrews";
    expect(summaryBlocks(text)).toEqual([{ kind: "table", header: ["Time", "Person"], rows: [["11:39", "{{1}}"], ["{{2}}", "Andrews"]] }]);
  });

  it("drops a markdown separator row and outer pipes", () => {
    const text = "| A | B |\n|---|:---:|\n| 1 | {{3}} |";
    expect(summaryBlocks(text)).toEqual([{ kind: "table", header: ["A", "B"], rows: [["1", "{{3}}"]] }]);
  });

  it("splits text around a table", () => {
    const blocks = summaryBlocks("Intro line\nSecond line\nA | B\n1 | 2\nOutro {{4}}");
    expect(blocks.map((b) => b.kind)).toEqual(["text", "table", "text"]);
    expect(blocks[0]).toEqual({ kind: "text", text: "Intro line\nSecond line" });
  });
});
