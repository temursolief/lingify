import Link from "next/link";
import { ButtonLink, Card, cx } from "./ui";

type Plan = {
  tasks: { id: string; label: string; done: boolean; detail: string; href: string }[];
  complete: boolean;
  assignments: { id: string; title: string; slug: string; dueAt: Date | null; overdue: boolean; note: string | null }[];
};

function dueLabel(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Today's three tasks, ticked off as they are done, with one button for the next one. */
export function TodayPlan({ plan }: { plan: Plan }) {
  const next = plan.tasks.find((t) => !t.done);
  const done = plan.tasks.filter((t) => t.done).length;
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <p className="font-semibold">Today&apos;s plan</p>
        <span className={cx("text-sm", plan.complete ? "text-good" : "text-muted")}>{plan.complete ? "All done. Great work!" : `${done} of ${plan.tasks.length} done`}</span>
      </div>
      <ul className="px-4 py-2">
        {plan.tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2">
            <span
              aria-hidden
              className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs", t.done ? "bg-good text-white" : "ring-2 ring-line ring-inset")}
            >
              {t.done ? "✓" : ""}
            </span>
            <span className={cx("flex-1", t.done && "text-muted line-through")}>{t.label}</span>
            <span className="text-sm text-muted">{t.detail}</span>
          </li>
        ))}
      </ul>
      {plan.assignments.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <p className="text-sm text-muted">From your teacher</p>
          <ul className="mt-1 space-y-1">
            {plan.assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/student/read/${a.slug}`}>{a.title}</Link>
                <span className={cx("text-sm", a.overdue ? "font-medium text-bad" : "text-muted")}>
                  {a.dueAt ? `${a.overdue ? "Overdue, was due" : "Due"} ${dueLabel(a.dueAt)}` : "No due date"}
                  {a.note ? ` · ${a.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {next && (
        <div className="border-t border-line px-4 py-3">
          <ButtonLink href={next.href} className="w-full">{next.label}</ButtonLink>
        </div>
      )}
    </Card>
  );
}
