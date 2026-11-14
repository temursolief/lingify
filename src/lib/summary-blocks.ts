/**
 * A summary's text, split into blocks. Runs of lines containing "|" are a table
 * ("Column | Column", first row is the header); everything else is plain text that keeps its line breaks.
 */
export type SummaryBlock = { kind: "text"; text: string } | { kind: "table"; header: string[]; rows: string[][] };

const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function summaryBlocks(text: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = [];
  let prose: string[] = [];
  let table: string[] = [];

  const flushProse = () => {
    const t = prose.join("\n");
    if (t.trim()) blocks.push({ kind: "text", text: t });
    prose = [];
  };
  const flushTable = () => {
    const lines = table.filter((l) => !SEPARATOR.test(l));
    if (lines.length) {
      const [header, ...rows] = lines.map(cells);
      blocks.push({ kind: "table", header, rows });
    }
    table = [];
  };

  for (const line of text.split("\n")) {
    if (line.includes("|")) {
      flushProse();
      table.push(line);
    } else {
      flushTable();
      prose.push(line);
    }
  }
  flushProse();
  flushTable();
  return blocks;
}
