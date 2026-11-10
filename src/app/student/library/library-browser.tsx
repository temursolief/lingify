"use client";

import { useState } from "react";
import { TextTable } from "@/components/text-table";
import { Card, cx } from "@/components/ui";
import type { LibraryEntry } from "@/lib/recommend";

/** Telegram-style folder chips instead of filters: each shows its count. */
const FOLDERS = [
  { key: "open", label: "For me", empty: "You have read every text at your level. New ones open as you learn more words." },
  { key: "pleasure", label: "Easy reads", empty: "No easy reads yet. Texts become easy as you learn their words." },
  { key: "read", label: "Read", empty: "Texts you finish will appear here." },
  { key: "locked", label: "Coming soon", empty: "Every text is open to you." },
] as const;

type Folder = (typeof FOLDERS)[number]["key"];

const inFolder = (e: LibraryEntry, key: Folder) =>
  key === "read" ? e.completed : key === "locked" ? e.level === "locked" : !e.completed && (key === "open" ? e.level !== "locked" : e.level === "pleasure");

export function LibraryBrowser({ entries, wpm }: { entries: LibraryEntry[]; wpm: number }) {
  const [folder, setFolder] = useState<Folder>("open");
  const shown = entries.filter((e) => inFolder(e, folder));
  const ordered = folder === "locked" ? [...shown].sort((a, b) => b.coverage - a.coverage) : shown;
  const current = FOLDERS.find((f) => f.key === folder)!;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Show">
        {FOLDERS.map((f) => {
          const count = entries.filter((e) => inFolder(e, f.key)).length;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={folder === f.key}
              onClick={() => setFolder(f.key)}
              className={cx(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                folder === f.key ? "bg-accent text-white" : "bg-surface text-muted shadow-bubble hover:text-ink",
              )}
            >
              {f.label} <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      {ordered.length ? (
        <TextTable entries={ordered} wpm={wpm} />
      ) : (
        <Card className="py-8 text-center text-muted">{current.empty}</Card>
      )}
    </div>
  );
}
