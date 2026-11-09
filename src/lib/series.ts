/** Narrow reading: texts on one theme, read in order, so vocabulary and ideas come back naturally. */
export const SERIES: Record<string, string> = {
  kindness: "Stories of kindness",
  brain: "How your brain works",
  "history-of-things": "Everyday things in history",
  "remarkable-women": "Remarkable women",
  animals: "Amazing animals",
  "new-beginnings": "New beginnings",
};

export function seriesTitle(id: string) {
  return SERIES[id] ?? id;
}
