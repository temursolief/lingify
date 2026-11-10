import Link from "next/link";
import { ButtonLink, cx } from "./ui";

type Plan = {
  tasks: { id: string; label: string; done: boolean; detail: string; href: string }[];
  complete: boolean;
  assignments: { id: string; title: string; slug: string; dueAt: Date | null; overdue: boolean; note: string | null }[];
};

function dueLabel(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function TodayPlan({ plan }: { plan: Plan }) {
  const next = plan.tasks.find((t) => !t.done);
  const done = plan.tasks.filter((t) => t.done).length;
  return (
    <section className="rounded-md border border-line">
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <h2 className="text-lg font-semibold">Today&apos;s plan</h2>
        <span className={cx("text-sm", plan.complete ? "text-good" : "text-muted")}>{plan.complete ? "All done. Great work!" : `${done} of ${plan.tasks.length} done`}</span>
      </div>
      <ul className="px-5 py-3">
        {plan.tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-1.5">
            <span
              aria-hidden
              className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs", t.done ? "border-good bg-good text-white" : "border-line")}
            >
              {t.done ? "✓" : ""}
            </span>
            <span className={cx("flex-1", t.done && "text-muted line-through")}>{t.label}</span>
            <span className="text-sm text-muted">{t.detail}</span>
          </li>
        ))}
      </ul>
      {plan.assignments.length > 0 && (
        <div className="border-t border-line px-5 py-3">
          <p className="text-sm font-medium">From your teacher</p>
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
        <div className="border-t border-line bg-paper px-5 py-3">
          <ButtonLink href={next.href} className="px-5">{next.label}</ButtonLink>
        </div>
      )}
    </section>
  );
}
