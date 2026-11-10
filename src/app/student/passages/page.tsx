import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, PageSkeleton, cx } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { studentSummary } from "@/lib/class-overview";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Passages" };

type AttemptInfo = { firstSubmittedAt: Date | null; completedAt: Date | null; firstCorrect: number | null; total: number; band: number | null; red: number };

function status(a: AttemptInfo | undefined) {
  if (!a) return { text: "Not started", tone: "text-muted" };
  if (!a.firstSubmittedAt) return { text: "In progress", tone: "text-accent" };
  const score = `${a.firstCorrect}/${a.total} · band ${a.band}`;
  if (a.completedAt) return { text: `Done · ${score}`, tone: "text-good" };
  return { text: `${a.red} to correct · ${score}`, tone: "text-bad" };
}

function dueLabel(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

async function PassagesContent() {
  const user = await requireStudent();
  const now = new Date();
  const [assigned, builtIn, attempts, summary] = await Promise.all([
    db.assignmentRecipient.findMany({
      where: { studentId: user.id },
      include: { assignment: { include: { passage: { select: { id: true, slug: true, title: true, timeLimit: true } } } } },
      orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { assignment: { dueAt: { sort: "asc", nulls: "last" } } }],
    }),
    db.passage.findMany({ where: { ownerId: null }, orderBy: { title: "asc" }, select: { id: true, slug: true, title: true, timeLimit: true } }),
    db.passageAttempt.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: "desc" },
      select: { passageId: true, firstSubmittedAt: true, completedAt: true, firstCorrect: true, total: true, band: true, answers: { where: { correct: false }, select: { number: true } } },
    }),
    studentSummary(user.id),
  ]);
  const latest = new Map<string, AttemptInfo>();
  for (const a of attempts) if (!latest.has(a.passageId)) latest.set(a.passageId, { ...a, red: a.answers.length });
  const assignedIds = new Set(assigned.map((a) => a.assignment.passageId));

  const Row = ({ p, extra }: { p: { slug: string; title: string; timeLimit: number; id: string }; extra?: React.ReactNode }) => {
    const s = status(latest.get(p.id));
    return (
      <li>
        <Link href={`/student/passages/${p.slug}`} className="flex items-center gap-4 px-4 py-3 text-ink no-underline hover:bg-hover hover:no-underline">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{p.title}</span>
            <span className="block truncate text-sm text-muted">{p.timeLimit} min{extra}</span>
          </span>
          <span className={cx("shrink-0 text-sm tabular-nums", s.tone)}>{s.text}</span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Passages" subtitle={summary.band ? `Estimated band ${summary.band} from your last passages` : "IELTS Academic Reading practice"} />
      <div className="mx-auto max-w-3xl space-y-6">
        {assigned.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-medium text-muted">From your teacher</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface shadow-bubble">
              {assigned.map((r) => (
                <Row
                  key={r.assignmentId}
                  p={r.assignment.passage}
                  extra={
                    <>
                      {r.assignment.dueAt && (
                        <span className={cx(!r.completedAt && r.assignment.dueAt < now && "font-medium text-bad")}>
                          {" "}· {r.assignment.dueAt < now && !r.completedAt ? "was due" : "due"} {dueLabel(r.assignment.dueAt)}
                        </span>
                      )}
                      {r.assignment.note && ` · ${r.assignment.note}`}
                    </>
                  }
                />
              ))}
            </ul>
          </section>
        )}
        <section>
          <h2 className="mb-2 px-1 text-sm font-medium text-muted">Practice passages</h2>
          {builtIn.filter((p) => !assignedIds.has(p.id)).length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface shadow-bubble">
              {builtIn.filter((p) => !assignedIds.has(p.id)).map((p) => <Row key={p.id} p={p} />)}
            </ul>
          ) : (
            <Card className="text-muted">No practice passages yet.</Card>
          )}
        </section>
        <p className="px-1 text-sm text-muted">
          The first try is timed like the exam and gives your score. Then correct the red answers: highlight the sentence that proves each new answer.
        </p>
      </div>
    </>
  );
}

export default function PassagesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PassagesContent />
    </Suspense>
  );
}
