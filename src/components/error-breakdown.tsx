import type { ErrorBreakdown } from "@/lib/insights";
import { Card } from "./ui";

const TAG = {
  VOCAB: { title: "Vocab / Synonym", hint: "didn't know a word or missed the paraphrase", color: "var(--navy)" },
  DISTRACTOR: { title: "Trap / Distractor", hint: "fell for a word-match trick", color: "var(--accent)" },
  LOGIC: { title: "Logic / NG vs False", hint: "over-inferred or misread the logic", color: "var(--olive)" },
  CARELESS: { title: "Speed / Careless", hint: "skimmed too fast or misread", color: "var(--brass)" },
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
        <Card className="bg-accent-soft shadow-[0_0_0_1px_var(--color-accent-800)]">
          <p className="kicker">Biggest bottleneck</p>
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
                <div style={{ width: `${pct(row.mistakes - Object.values(row.tags).reduce((a, b) => a + (b ?? 0), 0), data.byType[0].mistakes)}%` }} className="bg-[var(--color-neutral-600)]" />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-0">
        <p className="px-4 pt-4 font-semibold">Skill bottlenecks: question type × cause</p>
        <p className="px-4 text-sm text-muted">
          First-try mistakes by IELTS question type, against the reason given after correcting them and where the proof was found.
        </p>
        <div className="overflow-x-auto px-4 pt-3 pb-4">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="py-1.5 pr-3 text-left font-normal">Question type</th>
                {(Object.keys(TAG) as (keyof typeof TAG)[]).map((t) => (
                  <th key={t} className="px-2 py-1.5 text-right font-normal">{TAG[t].title.split(" / ")[0]}</th>
                ))}
                <th className="px-2 py-1.5 text-right font-normal" title="Proof highlighted in a different paragraph from the answer">Wrong place</th>
                <th className="py-1.5 pl-2 text-right font-normal" title="Proof in the right paragraph, but the sentence was misread">Misread</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {data.byType.map((row) => {
                const top = Math.max(...(Object.keys(TAG) as (keyof typeof TAG)[]).map((t) => row.tags[t] ?? 0));
                return (
                  <tr key={row.type}>
                    <td className="py-1.5 pr-3">{row.label} <span className="text-muted">· {row.mistakes}</span></td>
                    {(Object.keys(TAG) as (keyof typeof TAG)[]).map((t) => (
                      <td key={t} className={`px-2 py-1.5 text-right ${row.tags[t] && row.tags[t] === top ? "font-semibold" : "text-muted"}`} style={row.tags[t] && row.tags[t] === top ? { color: TAG[t].color } : undefined}>
                        {row.tags[t] ?? 0}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right">{row.wrongParagraph}</td>
                    <td className="py-1.5 pl-2 text-right">{row.rightParagraph}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {data.location + data.comprehension > 0 && (
        <Card>
          <p className="font-semibold">Where {who === "you" ? "you" : "they"} looked</p>
          <p className="mt-1 text-sm text-muted">From the sentences highlighted as proof, compared with where the answer really is.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-raised p-3">
              <p className="text-2xl font-semibold tabular-nums">{data.location}</p>
              <p className="text-sm">Location errors</p>
              <p className="text-xs text-muted">Looked in the wrong paragraph</p>
            </div>
            <div className="rounded-lg bg-raised p-3">
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
