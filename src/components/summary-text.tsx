import type { ReactNode } from "react";
import { summaryBlocks } from "@/lib/summary-blocks";
import { cx } from "./ui";

/** Splits a line on {{number}} placeholders and lets the caller render each gap (an input on the student's screen). */
const withGaps = (text: string, gap: (n: number) => ReactNode, nowrapGaps = false) =>
  text.split(/(\{\{\d+\}\})/).map((part, i) => {
    const m = part.match(/^\{\{(\d+)\}\}$/);
    return m ? <span key={i} className={nowrapGaps ? "whitespace-nowrap" : undefined}>{gap(Number(m[1]))}</span> : <span key={i}>{part}</span>;
  });

/**
 * IELTS summary / table completion. Plain text keeps its line breaks; runs of "Column | Column" lines become a table
 * whose first row is the header. The table scrolls sideways on narrow screens instead of squeezing the gaps.
 */
export function SummaryText({ title, text, gap }: { title?: string; text: string; gap: (n: number) => ReactNode }) {
  const blocks = summaryBlocks(text);
  return (
    <div className="space-y-3 rounded-lg bg-paper p-4 leading-loose">
      {/* Above prose the title sits tight, as before; above a table it keeps the normal gap. */}
      {title && <p className={cx("font-semibold", blocks[0]?.kind === "text" && "-mb-2")}>{title}</p>}
      {blocks.map((b, bi) => {
        if (b.kind === "text") return <p key={bi} className="whitespace-pre-line">{withGaps(b.text, gap)}</p>;
        const columns = Math.max(b.header.length, ...b.rows.map((r) => r.length));
        return (
          // contain: its width comes from the parent only, so a wide table scrolls here instead of widening the page.
          <div key={bi} className="-mx-4 overflow-x-auto px-4 [contain:inline-size]">
            <table className="w-full border-collapse text-[15px] leading-snug">
              <thead>
                <tr>
                  {Array.from({ length: columns }, (_, ci) => (
                    <th key={ci} scope="col" className="border border-line bg-[var(--color-neutral-900)] px-3 py-2 text-left font-semibold">
                      {withGaps(b.header[ci] ?? "", gap, true)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className="bg-surface">
                    {Array.from({ length: columns }, (_, ci) => (
                      <td key={ci} className="min-w-28 border border-line px-3 py-1.5 align-middle">{withGaps(r[ci] ?? "", gap, true)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
