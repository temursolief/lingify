"use client";

import { useState } from "react";
import { TextCard } from "@/components/text-card";
import { EmptyState, cx } from "@/components/ui";
import type { LibraryEntry } from "@/lib/recommend";
import { topicLabel } from "@/lib/topics";

const LEVELS = [
  { key: "open", label: "At my level" },
  { key: "pleasure", label: "Pleasure reads" },
  { key: "locked", label: "Coming soon" },
  { key: "all", label: "All" },
] as const;

type LevelKey = (typeof LEVELS)[number]["key"];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "whitespace-nowrap rounded-full border px-3 py-1 text-sm transition",
        active ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-surface text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function LibraryBrowser({ entries, wpm }: { entries: LibraryEntry[]; wpm: number }) {
  const [level, setLevel] = useState<LevelKey>("open");
  const [genre, setGenre] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [hideRead, setHideRead] = useState(false);

  const genres = [...new Set(entries.map((e) => e.genre))].sort();
  const topics = [...new Set(entries.flatMap((e) => e.topics))].sort();
  const shown = entries.filter(
    (e) =>
      (level === "all" ||
        (level === "open" && e.level !== "locked") ||
        (level === "pleasure" && e.level === "pleasure") ||
        (level === "locked" && e.level === "locked")) &&
      (!genre || e.genre === genre) &&
      (!topic || e.topics.includes(topic)) &&
      (!hideRead || !e.completed),
  );
  const ordered = level === "locked" ? [...shown].sort((a, b) => b.coverage - a.coverage) : shown;

  return (
    <div>
      <div className="mb-6 space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <Chip key={l.key} active={level === l.key} onClick={() => setLevel(l.key)}>
              {l.label} <span className="tabular-nums opacity-70">({entries.filter((e) => l.key === "all" || (l.key === "open" ? e.level !== "locked" : e.level === l.key)).length})</span>
            </Chip>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" checked={hideRead} onChange={(e) => setHideRead(e.target.checked)} className="accent-[var(--accent)]" />
            Hide texts I&apos;ve read
          </label>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={!genre} onClick={() => setGenre(null)}>Any type</Chip>
          {genres.map((g) => <Chip key={g} active={genre === g} onClick={() => setGenre(genre === g ? null : g)}>{g}</Chip>)}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={!topic} onClick={() => setTopic(null)}>Any topic</Chip>
          {topics.map((t) => <Chip key={t} active={topic === t} onClick={() => setTopic(topic === t ? null : t)}>{topicLabel(t)}</Chip>)}
        </div>
      </div>

      {ordered.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ordered.map((e) => <TextCard key={e.id} entry={e} wpm={wpm} />)}
        </div>
      ) : (
        <EmptyState title="No texts match these filters">Try a different type or topic.</EmptyState>
      )}
    </div>
  );
}
