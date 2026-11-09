import Link from "next/link";
import type { LibraryEntry } from "@/lib/recommend";
import { readingMinutes } from "@/lib/texts";
import { Badge, cx } from "./ui";

export function TextCard({ entry, wpm }: { entry: LibraryEntry; wpm: number }) {
  const locked = entry.level === "locked";
  return (
    <Link
      href={`/student/read/${entry.slug}`}
      className={cx(
        "group flex flex-col rounded-xl border border-line bg-surface p-5 transition hover:border-muted",
        locked && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{entry.genre}</Badge>
        {entry.assigned && <Badge tone="accent">Assigned</Badge>}
        {entry.completed && <Badge tone="good">Read ✓</Badge>}
        {entry.level === "pleasure" && <Badge tone="good">Pleasure read</Badge>}
        {locked && <Badge tone="warn">🔒 Not yet</Badge>}
      </div>
      <h3 className="mt-3 font-serif text-lg font-semibold leading-snug group-hover:underline">{entry.title}</h3>
      <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted">{entry.summary}</p>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span className={cx("font-medium tabular-nums", locked ? "text-warn" : "text-ink")}>
          You know {(entry.coverage * 100).toFixed(1)}%
        </span>
        <span>{entry.wordCount} words · ~{readingMinutes(entry.wordCount, wpm)} min</span>
        {!locked && entry.newWords > 0 && <span>{entry.newWords} new words</span>}
        {entry.recycled > 0 && <span>{entry.recycled} of your learning words</span>}
      </div>
    </Link>
  );
}
