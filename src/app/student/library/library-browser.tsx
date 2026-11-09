"use client";

import { Fragment, useState } from "react";
import { TextTable } from "@/components/text-table";
import { EmptyState, cx } from "@/components/ui";
import type { LibraryEntry } from "@/lib/recommend";
import { SERIES } from "@/lib/series";
import { topicLabel } from "@/lib/topics";

const LEVELS = [
  { key: "open", label: "At my level" },
  { key: "pleasure", label: "Easy reads" },
  { key: "locked", label: "Coming soon" },
  { key: "all", label: "All" },
] as const;

type LevelKey = (typeof LEVELS)[number]["key"];

/** A row of comma-separated choices, like the category links on AnkiWeb's shared decks page. */
function LinkRow<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { value: T | null; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <p>
      <span className="text-muted">{label}: </span>
      {options.map((o, i) => (
        <Fragment key={o.label}>
          {i > 0 && ", "}
          <button
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx(value === o.value ? "font-bold text-ink" : "text-accent underline")}
          >
            {o.label}
          </button>
        </Fragment>
      ))}
    </p>
  );
}

export function LibraryBrowser({ entries, wpm }: { entries: LibraryEntry[]; wpm: number }) {
  const [level, setLevel] = useState<LevelKey | null>("open");
  const [genre, setGenre] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [series, setSeries] = useState<string | null>(null);
  const [hideRead, setHideRead] = useState(false);

  const genres = [...new Set(entries.map((e) => e.genre))].sort();
  const topics = [...new Set(entries.flatMap((e) => e.topics))].sort();
  const count = (key: LevelKey) => entries.filter((e) => key === "all" || (key === "open" ? e.level !== "locked" : e.level === key)).length;
  const shown = entries.filter(
    (e) =>
      (!level || level === "all" ||
        (level === "open" && e.level !== "locked") ||
        (level === "pleasure" && e.level === "pleasure") ||
        (level === "locked" && e.level === "locked")) &&
      (!genre || e.genre === genre) &&
      (!topic || e.topics.includes(topic)) &&
      (!series || e.series === series) &&
      (!hideRead || !e.completed),
  );
  const ordered = series
    ? [...shown].sort((a, b) => (a.seriesPart ?? 0) - (b.seriesPart ?? 0))
    : level === "locked"
      ? [...shown].sort((a, b) => b.coverage - a.coverage)
      : shown;

  return (
    <div>
      <div className="mb-4 space-y-1">
        <LinkRow
          label="Show"
          options={LEVELS.map((l) => ({ value: l.key, label: `${l.label} (${count(l.key)})` }))}
          value={level}
          onChange={(v) => setLevel(v ?? "all")}
        />
        <LinkRow label="Type" options={[{ value: null, label: "Any" }, ...genres.map((g) => ({ value: g, label: g }))]} value={genre} onChange={setGenre} />
        <LinkRow
          label="Series"
          options={[{ value: null, label: "Any" }, ...Object.entries(SERIES).map(([id, title]) => ({ value: id, label: title }))]}
          value={series}
          onChange={setSeries}
        />
        <LinkRow label="Topic" options={[{ value: null, label: "Any" }, ...topics.map((t) => ({ value: t, label: topicLabel(t) }))]} value={topic} onChange={setTopic} />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={hideRead} onChange={(e) => setHideRead(e.target.checked)} className="accent-[var(--accent)]" />
          Hide texts I&apos;ve read
        </label>
      </div>
      {ordered.length ? <TextTable entries={ordered} wpm={wpm} /> : <EmptyState title="No texts match these filters." />}
    </div>
  );
}
