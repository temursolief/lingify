import Link from "next/link";
import type { LibraryEntry } from "@/lib/recommend";
import { seriesTitle } from "@/lib/series";
import { readingMinutes } from "@/lib/texts";
import { cx } from "./ui";

/** Dense list in the style of AnkiWeb's shared-decks table. */
export function TextTable({ entries, wpm, showSeries = true }: { entries: LibraryEntry[]; wpm: number; showSeries?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-accent">
            <th className="py-1 pr-3 font-normal underline">Title</th>
            <th className="hidden py-1 pr-3 font-normal underline md:table-cell">Type</th>
            {showSeries && <th className="hidden py-1 pr-3 font-normal underline lg:table-cell">Series</th>}
            <th className="py-1 pr-3 font-normal underline">You know</th>
            <th className="py-1 pr-3 text-right font-normal underline">Words</th>
            <th className="hidden py-1 pr-3 text-right font-normal underline sm:table-cell">New</th>
            <th className="py-1 font-normal underline">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const locked = e.level === "locked";
            const pct = e.coverage * 100;
            return (
              <tr key={e.id} className={cx("align-top", locked && "text-muted")}>
                <td className="py-0.5 pr-3">
                  <Link href={`/student/read/${e.slug}`} className="no-underline hover:underline">{e.title}</Link>
                  {e.classmateRecs > 0 && <span className="ml-1 text-sm text-muted" title="Recommended by classmates">👍{e.classmateRecs}</span>}
                </td>
                <td className="hidden py-0.5 pr-3 md:table-cell">{e.genre}</td>
                {showSeries && (
                  <td className="hidden py-0.5 pr-3 lg:table-cell">{e.series ? `${seriesTitle(e.series)} ${e.seriesPart}` : ""}</td>
                )}
                <td className="py-0.5 pr-3 whitespace-nowrap tabular-nums">
                  <span
                    className="mr-1.5 inline-block h-1 w-[25px] align-middle"
                    style={{ background: `linear-gradient(to right, ${locked ? "#dc3545" : "#0d6efd"} ${Math.max(0, (pct - 90) * 10)}%, #dee2e6 0)` }}
                    aria-hidden
                  />
                  {pct.toFixed(1)}%
                </td>
                <td className="py-0.5 pr-3 text-right tabular-nums" title={`about ${readingMinutes(e.wordCount, wpm)} min`}>{e.wordCount}</td>
                <td className="hidden py-0.5 pr-3 text-right tabular-nums sm:table-cell">{locked ? "" : e.newWords}</td>
                <td className="py-0.5 whitespace-nowrap">
                  {e.completed ? (
                    <span className="text-good">Read</span>
                  ) : e.assigned ? (
                    <span className="text-accent">Assigned</span>
                  ) : locked ? (
                    "Not yet"
                  ) : e.level === "pleasure" ? (
                    "Easy read"
                  ) : e.stopped ? (
                    "Stopped"
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
