import type { LearningProfile } from "@/lib/profile";
import { LineChart } from "./charts";
import { Badge, Card, cx } from "./ui";

const STATUS = {
  achieved: { label: "I can do this", tone: "good" as const, icon: "✓" },
  developing: { label: "Getting there", tone: "accent" as const, icon: "◐" },
  "not-yet": { label: "Not yet", tone: "neutral" as const, icon: "○" },
};

export function LearningProfileView({ profile, viewer = "student" }: { profile: LearningProfile; viewer?: "student" | "teacher" }) {
  const you = viewer === "student";
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-semibold">{you ? "What I can do" : "Can-do statements"}</h2>
        <p className="mb-4 text-sm text-muted">Based on {you ? "your" : "their"} answers and reading so far.</p>
        <ul className="divide-y divide-line">
          {profile.canDo.map((c) => {
            const s = STATUS[c.status];
            return (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={cx(c.status === "not-yet" && "text-muted")}>
                    <span aria-hidden className="mr-2">{s.icon}</span>
                    {c.statement}
                  </p>
                  <p className="ml-6 text-xs text-muted">{c.evidence}</p>
                </div>
                <Badge tone={s.tone}>{s.label}</Badge>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Reading skills</h2>
          <p className="mb-4 text-sm text-muted">First-try accuracy by type of question.</p>
          <ul className="space-y-3">
            {profile.skills.map((s) => (
              <li key={s.skill}>
                <div className="flex justify-between gap-2 text-sm">
                  <span>{s.label}</span>
                  <span className="font-medium tabular-nums">
                    {s.accuracy === null ? "–" : `${Math.round(s.accuracy * 100)}%`} <span className="font-normal text-muted">({s.total})</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-md bg-grid">
                  {s.accuracy !== null && (
                    <div
                      className="h-full"
                      style={{ width: `${s.accuracy * 100}%`, background: profile.weakest?.skill === s.skill ? "var(--warn)" : "var(--series-1)" }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
          {profile.weakest && (
            <p className="mt-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">
              Area to work on: <strong>{profile.weakest.label}</strong>
            </p>
          )}
          <p className="mt-3 text-sm text-muted">
            Guessing words from context: {profile.guess.total ? `${profile.guess.correct} of ${profile.guess.total} correct` : "no guesses yet"}
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold">Grammar path</h2>
          <p className="mb-4 text-sm text-muted">
            Structures in the order most learners pick them up. {you ? "You are" : "Currently"} at stage {profile.grammarStage} of 5.
          </p>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((stage) => (
              <div key={stage}>
                <p className={cx("text-xs font-medium", stage === profile.grammarStage ? "text-accent" : "text-muted")}>
                  Stage {stage}{stage === profile.grammarStage ? " · now" : ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {profile.grammar.filter((g) => g.stage === stage).map((g) => (
                    <Badge key={g.key} tone={g.status === "mastered" ? "good" : g.status === "practising" ? "accent" : "neutral"}>
                      {g.status === "mastered" ? "✓ " : ""}{g.label}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {!you && <Card>
        <h2 className="font-semibold">Speed reading</h2>
        <p className="mb-4 text-sm text-muted">
          Words per minute on easy texts. {profile.fluency.best ? `Best: ${profile.fluency.best} wpm.` : ""} Fluent readers of easy texts reach 150–200.
        </p>
        <LineChart data={profile.fluency.runs} unit=" wpm" label="Speed reading words per minute" />
      </Card>}
    </div>
  );
}
