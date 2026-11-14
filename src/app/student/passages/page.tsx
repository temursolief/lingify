import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, PageSkeleton, cx } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { studentSummary } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { formatDay } from "@/lib/time";

export const metadata: Metadata = { title: "Passages" };

type AttemptInfo = { firstSubmittedAt: Date | null; completedAt: Date | null; firstCorrect: number | null; total: number; band: number | null; red: number };

function status(a: AttemptInfo | undefined) {
  if (!a) return { text: "Not started", tone: "text-muted" };
  if (!a.firstSubmittedAt) return { text: "In progress", tone: "text-accent" };
  const score = `${a.firstCorrect}/${a.total} · band ${a.band}`;
  if (a.completedAt) return { text: `Done · ${score}`, tone: "text-good" };
  return { text: `${a.red} to correct · ${score}`, tone: "text-bad" };
}

const dueLabel = (d: Date) => formatDay(d, true);

async function PassagesContent() {
  const user = await requireStudent();
  const now = new Date();
  // Each assigned passage with the student's latest attempt at it and its red answers counted: one statement.
  const [rows, summary] = await Promise.all([
    db.$queryRaw<
      {
        assignmentId: string;
        completedAt: Date | null;
        dueAt: Date | null;
        note: string | null;
        id: string;
        slug: string;
        title: string;
        timeLimit: number;
        aFirstSubmittedAt: Date | null;
        aCompletedAt: Date | null;
        aFirstCorrect: number | null;
        aTotal: number | null;
        aBand: number | null;
        aRed: number | null;
        started: boolean;
      }[]
    >`
      SELECT r."assignmentId", r."completedAt", a."dueAt", a.note, p.id, p.slug, p.title, p."timeLimit",
             x."firstSubmittedAt" AS "aFirstSubmittedAt", x."completedAt" AS "aCompletedAt", x."firstCorrect" AS "aFirstCorrect", x.total AS "aTotal", x.band AS "aBand", x.red AS "aRed",
             x.id IS NOT NULL AS started
      FROM "AssignmentRecipient" r
      JOIN "Assignment" a ON a.id = r."assignmentId"
      JOIN "Passage" p ON p.id = a."passageId" AND p."archivedAt" IS NULL
      LEFT JOIN LATERAL (
        SELECT t.id, t."firstSubmittedAt", t."completedAt", t."firstCorrect", t.total, t.band,
               (SELECT count(*) FROM "QuestionAnswer" q WHERE q."attemptId" = t.id AND q.correct = false)::int AS red
        FROM "PassageAttempt" t WHERE t."userId" = r."studentId" AND t."passageId" = p.id AND t."invalidatedAt" IS NULL
        ORDER BY t."startedAt" DESC LIMIT 1
      ) x ON true
      WHERE r."studentId" = ${user.id}
      ORDER BY r."completedAt" ASC NULLS FIRST, a."dueAt" ASC NULLS LAST`,
    studentSummary(user.id),
  ]);
  const assigned = rows.map((r) => ({ assignmentId: r.assignmentId, completedAt: r.completedAt, assignment: { dueAt: r.dueAt, note: r.note, passage: { id: r.id, slug: r.slug, title: r.title, timeLimit: r.timeLimit } } }));
  const latest = new Map<string, AttemptInfo>();
  for (const r of rows) {
    if (r.started) latest.set(r.id, { firstSubmittedAt: r.aFirstSubmittedAt, completedAt: r.aCompletedAt, firstCorrect: r.aFirstCorrect, total: r.aTotal!, band: r.aBand, red: r.aRed ?? 0 });
  }

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
      <PageHeader kicker="Practice · Reading" title="Passages" subtitle={summary.band ? `Estimated band ${summary.band} from your last passages` : undefined} />
      <div className="max-w-3xl space-y-6">
        <section>
          <h2 className="mb-2 px-1 text-sm font-medium text-muted">From your teacher</h2>
          {assigned.length === 0 ? (
            <Card className="text-muted">Nothing assigned yet. Ask your teacher.</Card>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface shadow-bubble">
              {assigned.map((r) => (
                <Row
                  key={r.assignmentId}
                  p={r.assignment.passage!}
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
          )}
        </section>
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
