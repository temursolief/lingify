"use client";

import { useState } from "react";
import { TextTable } from "@/components/text-table";
import { EmptyState, cx } from "@/components/ui";
import type { LibraryEntry } from "@/lib/recommend";

const LEVELS = [
  { key: "open", label: "For me" },
  { key: "pleasure", label: "Easy reads" },
  { key: "locked", label: "Coming soon" },
  { key: "all", label: "All" },
] as const;

type LevelKey = (typeof LEVELS)[number]["key"];

const matches = (e: LibraryEntry, key: LevelKey) =>
  key === "all" || (key === "open" ? e.level !== "locked" : e.level === key);

export function LibraryBrowser({ entries, wpm }: { entries: LibraryEntry[]; wpm: number }) {
  const [level, setLevel] = useState<LevelKey>("open");
  const [genre, setGenre] = useState("");
  const [hideRead, setHideRead] = useState(false);

  const genres = [...new Set(entries.map((e) => e.genre))].sort();
  const shown = entries.filter((e) => matches(e, level) && (!genre || e.genre === genre) && (!hideRead || !e.completed));
  const ordered = level === "locked" ? [...shown].sort((a, b) => b.coverage - a.coverage) : shown;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="inline-flex" role="group" aria-label="Show">
          {LEVELS.map((l, i) => (
            <button
              key={l.key}
              type="button"
              aria-pressed={level === l.key}
              onClick={() => setLevel(l.key)}
              className={cx(
                "border border-accent px-3 py-1.5 text-sm",
                i === 0 ? "rounded-l-md" : "-ml-px",
                i === LEVELS.length - 1 && "rounded-r-md",
                level === l.key ? "bg-accent text-accent-ink" : "text-accent hover:bg-accent-soft",
              )}
            >
              {l.label} <span className="opacity-70">{entries.filter((e) => matches(e, l.key)).length}</span>
            </button>
          ))}
        </div>
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          aria-label="Type of text"
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
        >
          <option value="">All types</option>
          {genres.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hideRead} onChange={(e) => setHideRead(e.target.checked)} className="accent-[var(--accent)]" />
          Hide texts I&apos;ve read
        </label>
      </div>
      {ordered.length ? <TextTable entries={ordered} wpm={wpm} /> : <EmptyState title="No texts match." />}
    </div>
  );
}
