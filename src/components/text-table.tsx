import Link from "next/link";
import type { LibraryEntry } from "@/lib/recommend";
import { seriesTitle } from "@/lib/series";
import { readingMinutes } from "@/lib/texts";
import { cx } from "./ui";

function status(e: LibraryEntry) {
  if (e.completed) return <span className="text-good">Read</span>;
  if (e.assigned) return <span className="text-accent">Assigned</span>;
  if (e.level === "locked") return "Not yet";
  if (e.level === "pleasure") return "Easy read";
  if (e.stopped) return "Stopped";
  return "";
}

export function TextTable({ entries, wpm }: { entries: LibraryEntry[]; wpm: number }) {
  return (
    <table className="w-full text-left">
      <thead className="border-b border-line text-sm text-muted">
        <tr>
          <th className="py-2 pr-3 font-normal">Title</th>
          <th className="py-2 pr-3 font-normal">You know</th>
          <th className="hidden py-2 pr-3 text-right font-normal sm:table-cell">Time</th>
          <th className="py-2 font-normal" />
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {entries.map((e) => {
          const locked = e.level === "locked";
          return (
            <tr key={e.id} className={cx(locked && "text-muted")}>
              <td className="py-2.5 pr-3">
                <Link href={`/student/read/${e.slug}`} className={cx("no-underline hover:underline", locked && "text-muted")}>{e.title}</Link>
                <span className="block text-sm text-muted">
                  {e.genre}
                  {e.series ? ` · ${seriesTitle(e.series)}, part ${e.seriesPart}` : ""}
                </span>
              </td>
              <td className={cx("py-2.5 pr-3 tabular-nums", locked && "text-bad")}>{(e.coverage * 100).toFixed(0)}%</td>
              <td className="hidden py-2.5 pr-3 text-right tabular-nums sm:table-cell">{readingMinutes(e.wordCount, wpm)} min</td>
              <td className="py-2.5 text-right text-sm whitespace-nowrap">{status(e)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
