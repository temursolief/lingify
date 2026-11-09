import { GOAL_LABEL, type GoalProgress } from "@/lib/stats";
import { Badge, ProgressBar } from "./ui";

export function GoalList({ goals, actions }: { goals: GoalProgress[]; actions?: (goal: GoalProgress) => React.ReactNode }) {
  if (!goals.length) return <p className="mt-2 text-sm text-muted">No goals yet. Setting a weekly goal helps you read regularly.</p>;
  return (
    <ul className="mt-3 space-y-4">
      {goals.map((g) => {
        const done = g.current >= g.target;
        return (
          <li key={`${g.fromTeacher}-${g.id}`}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-medium tabular-nums">{g.current.toLocaleString()} / {g.target.toLocaleString()}</span> {GOAL_LABEL[g.type]}
              </span>
              <span className="flex items-center gap-2">
                {g.fromTeacher && <Badge tone="accent">Teacher goal</Badge>}
                {done && <Badge tone="good">Done ✓</Badge>}
                {actions?.(g)}
              </span>
            </div>
            <ProgressBar value={g.current / g.target} tone={done ? "good" : "accent"} label={GOAL_LABEL[g.type]} />
            {g.note && <p className="mt-1 text-xs text-muted">{g.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}
