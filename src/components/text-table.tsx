import Link from "next/link";
import type { LibraryEntry } from "@/lib/recommend";
import { seriesTitle } from "@/lib/series";
import { readingMinutes } from "@/lib/texts";
import { cx } from "./ui";

function note(e: LibraryEntry) {
  if (e.assigned && !e.completed) return <span className="text-accent">From your teacher</span>;
  if (e.level === "locked") return <span>Opens at 95% · you know {Math.round(e.coverage * 100)}%</span>;
  if (e.completed) return <span className="text-good">Read</span>;
  return null;
}

/** Texts as a list of rows in one white bubble, like a Telegram chat list: title, one muted line, details on the right. */
export function TextTable({ entries, wpm }: { entries: LibraryEntry[]; wpm: number }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface shadow-bubble">
      {entries.map((e) => {
        const locked = e.level === "locked";
        const extra = note(e);
        return (
          <li key={e.id}>
            <Link
              href={`/student/read/${e.slug}`}
              className={cx("flex items-center gap-4 px-4 py-3 text-ink no-underline hover:bg-hover hover:no-underline", locked && "text-muted")}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.title}</span>
                <span className="block truncate text-sm text-muted">
                  {e.genre}
                  {e.series ? ` · ${seriesTitle(e.series)}, part ${e.seriesPart}` : ""}
                  {extra && <> · {extra}</>}
                </span>
              </span>
              {!locked && <span className="shrink-0 text-sm text-muted tabular-nums">{readingMinutes(e.wordCount, wpm)} min</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
