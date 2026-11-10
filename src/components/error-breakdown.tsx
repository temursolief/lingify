import type { ErrorBreakdown } from "@/lib/insights";
import { Card } from "./ui";

const TAG = {
  VOCAB: { title: "Vocab / Synonym", hint: "didn't know a word or missed the paraphrase", color: "#65aadd" },
  DISTRACTOR: { title: "Trap / Distractor", hint: "fell for a word-match trick", color: "#e17076" },
  LOGIC: { title: "Logic / NG vs False", hint: "over-inferred or misread the logic", color: "#a695e7" },
  CARELESS: { title: "Speed / Careless", hint: "skimmed too fast or misread", color: "#faa774" },
} as const;

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** Where first-try mistakes come from, for a student ("you") or a class ("your students"). */
export function ErrorBreakdownView({ data, who = "you" }: { data: ErrorBreakdown; who?: "you" | "class" }) {
  const tagged = Object.values(data.tags).reduce((a, b) => a + b, 0);
  const subject = who === "you" ? "your" : "the class's";
  if (!data.mistakes) {
    return (
      <Card className="py-8 text-center text-muted">
        {data.passages ? "No mistakes on first tries yet. Impressive!" : "Finish a passage to see what causes mistakes."}
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {data.headline && (
        <Card className="bg-accent-soft">
          <p className="text-sm text-accent">Biggest bottleneck</p>
          <p className="mt-1 text-lg font-semibold">
            {Math.round(data.headline.share * 100)}% of {subject} mistakes are {TAG[data.headline.tag].title.toLowerCase()} in {data.headline.label}.
          </p>
          {data.passages < 5 && <p className="mt-1 text-sm text-muted">Based on {data.passages} passage{data.passages === 1 ? "" : "s"}. The picture gets clearer after five.</p>}
        </Card>
      )}

      <Card>
        <p className="font-semibold">Why answers were wrong the first time</p>
        <p className="mb-3 text-sm text-muted">{data.mistakes} mistakes on first tries, {tagged} explained after correcting them.</p>
        {tagged > 0 && (
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-grid">
            {(Object.keys(TAG) as (keyof typeof TAG)[]).map((t) =>
              data.tags[t] ? <div key={t} style={{ width: `${pct(data.tags[t], tagged)}%`, background: TAG[t].color }} title={TAG[t].title} /> : null,
            )}
          </div>
        )}
        <ul className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(TAG) as (keyof typeof TAG)[]).map((t) => (
            <li key={t} className="flex items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TAG[t].color }} />
              <span>
                <span className="font-medium">{TAG[t].title}</span> <span className="tabular-nums text-muted">· {data.tags[t]} ({pct(data.tags[t], tagged)}%)</span>
                <span className="block text-sm text-muted">{TAG[t].hint}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Mistakes by question type</p>
        <ul className="space-y-2.5">
          {data.byType.map((row) => (
            <li key={row.type}>
              <div className="flex justify-between text-sm">
                <span>{row.label}</span>
                <span className="tabular-nums text-muted">{row.mistakes}</span>
              </div>
              <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-grid">
                {(Object.keys(TAG) as (keyof typeof TAG)[]).map((t) =>
                  row.tags[t] ? <div key={t} style={{ width: `${pct(row.tags[t]!, data.byType[0].mistakes)}%`, background: TAG[t].color }} /> : null,
                )}
                <div style={{ width: `${pct(row.mistakes - Object.values(row.tags).reduce((a, b) => a + (b ?? 0), 0), data.byType[0].mistakes)}%` }} className="bg-[#c4c9cc]" />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {data.location + data.comprehension > 0 && (
        <Card>
          <p className="font-semibold">Where {who === "you" ? "you" : "they"} looked</p>
          <p className="mt-1 text-sm text-muted">From the sentences highlighted as proof, compared with where the answer really is.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-paper p-3">
              <p className="text-2xl font-semibold tabular-nums">{data.location}</p>
              <p className="text-sm">Location errors</p>
              <p className="text-xs text-muted">Looked in the wrong paragraph</p>
            </div>
            <div className="rounded-lg bg-paper p-3">
              <p className="text-2xl font-semibold tabular-nums">{data.comprehension}</p>
              <p className="text-sm">Comprehension errors</p>
              <p className="text-xs text-muted">Found the right place but misread it</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
