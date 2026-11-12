import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBreakdownView } from "@/components/error-breakdown";
import { IntegrityBadge, ReviewSpeed } from "@/components/integrity-badge";
import { Badge, Card, PageHeader, PageSkeleton, Tabs, cx } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { classOverview, teacherClass } from "@/lib/class-overview";
import { db } from "@/lib/db";
import { ERROR_TAG_LABEL } from "@/lib/passages";
import { errorBreakdown, homeworkMatrix, passageHeatmap, stuckStudents, type HeatCell, type HomeworkRow } from "@/lib/insights";
import { clock, POLICY_LABEL } from "@/lib/telemetry";
import { formatDay } from "@/lib/time";
import { AssignLessonForm, AssignPassageForm, DeleteAssignmentButton, RetakeButton } from "../../teacher-forms";

export const metadata: Metadata = { title: "Class" };

const TABS = [
  { key: "students", label: "Students" },
  { key: "homework", label: "Homework" },
  { key: "passages", label: "Passages" },
  { key: "listening", label: "Listening" },
  { key: "mistakes", label: "Mistakes" },
];

function ago(d: Date | null) {
  if (!d) return "never";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

async function ClassContent(props: PageProps<"/teacher/classes/[id]">) {
  const teacher = await requireTeacher();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const cls = await teacherClass(id, teacher.id);
  if (!cls) notFound();
  const tab = TABS.some((t) => t.key === sp.tab) ? String(sp.tab) : "students";
  const base = `/teacher/classes/${cls.id}`;
  const [rows, stuck] = await Promise.all([classOverview(cls.id), stuckStudents(cls.id)]);

  return (
    <>
      <PageHeader
        title={cls.name}
        subtitle={<>Join code <b className="text-ink">{cls.joinCode}</b> · {rows.length} student{rows.length === 1 ? "" : "s"}{stuck.length > 0 && <span className="text-bad"> · {stuck.length} stuck</span>}</>}
      />
      <Tabs current={tab} items={TABS.map((t) => ({ ...t, href: t.key === "students" ? base : `${base}?tab=${t.key}` }))} />

      {tab === "students" && (
        <div className="space-y-4">
          {stuck.length > 0 && (
            <Card className="bg-bad-soft">
              <p className="font-semibold text-bad">Stuck students</p>
              <p className="text-sm text-muted">Three or more tries and still red. A quick word in class may help.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {stuck.map((s) => (
                  <li key={`${s.userId}-${s.passageId}`}>
                    <Link href={`${base}/students/${s.userId}`} className="font-medium">{s.name}</Link> · {s.title} · question{s.questions.length > 1 ? "s" : ""} {s.questions.sort((a, b) => a - b).join(", ")}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {rows.length === 0 ? (
            <Card className="py-8 text-center text-muted">No students yet. Share the join code <b className="text-ink">{cls.joinCode}</b>.</Card>
          ) : (
            <div className="overflow-x-auto rounded-xl bg-surface shadow-bubble">
              <table className="w-full min-w-[860px] text-left text-[15px]">
                <thead className="border-b border-line text-sm text-muted">
                  <tr>
                    <th className="px-4 py-2 font-normal">Student</th>
                    <th className="px-3 py-2 text-right font-normal">Passages done</th>
                    <th className="px-3 py-2 text-right font-normal">Band (last 3)</th>
                    <th className="px-3 py-2 text-right font-normal">Flashcards, 7 days</th>
                    <th className="px-3 py-2 text-right font-normal">Streak</th>
                    <th className="px-3 py-2 font-normal">Integrity</th>
                    <th className="px-3 py-2 font-normal">Flashcard speed</th>
                    <th className="px-4 py-2 text-right font-normal">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-hover">
                      <td className="px-4 py-2.5">
                        <Link href={`${base}/students/${r.id}`}>{r.name}</Link>
                        {r.stuck > 0 && <span className="ml-2 text-xs text-bad">stuck</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.passagesDone}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.band ?? "–"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.cardsThisWeek}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.streak}</td>
                      <td className="px-3 py-2.5">
                        {r.flagged > 0 ? <Link href={`${base}/students/${r.id}`}><Badge tone="bad">{r.flagged} flagged</Badge></Link> : <Badge tone="good">Clean</Badge>}
                      </td>
                      <td className="px-3 py-2.5"><ReviewSpeed review={r.review} /></td>
                      <td className="px-4 py-2.5 text-right text-muted">{ago(r.lastActiveAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "homework" && <HomeworkTab classId={cls.id} base={base} selected={typeof sp.a === "string" ? sp.a : null} />}

      {tab === "passages" && <PassagesTab classId={cls.id} teacherId={teacher.id} base={base} selected={typeof sp.p === "string" ? sp.p : null} students={rows} />}

      {tab === "listening" && <ListeningTab classId={cls.id} students={rows} />}

      {tab === "mistakes" && (
        <div className="mx-auto max-w-3xl">
          <ErrorBreakdownView data={await errorBreakdown(rows.map((r) => r.id))} who="class" />
        </div>
      )}
    </>
  );
}

async function PassagesTab({ classId, teacherId, base, selected, students }: { classId: string; teacherId: string; base: string; selected: string | null; students: { id: string; name: string }[] }) {
  const [assignments, passages] = await Promise.all([
    db.assignment.findMany({
      where: { classId, passageId: { not: null }, passage: { archivedAt: null } },
      orderBy: { createdAt: "desc" },
      include: { passage: { select: { id: true, title: true } }, recipients: { select: { completedAt: true } } },
    }),
    db.passage.findMany({ where: { archivedAt: null, OR: [{ ownerId: null }, { ownerId: teacherId }] }, orderBy: { title: "asc" }, select: { id: true, title: true, ownerId: true } }),
  ]);
  const passageId = selected ?? assignments[0]?.passageId ?? null;
  const heat = passageId ? await passageHeatmap(classId, passageId) : null;
  const title = passages.find((p) => p.id === passageId)?.title;

  return (
    <div className="space-y-4">
      {heat && (
        <Card className="p-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
            <p className="font-semibold">{title}: first tries</p>
            <p className="text-sm text-muted">{heat.submitted} of {heat.rows.length} submitted</p>
          </div>
          {heat.submitted === 0 ? (
            <p className="px-4 pt-1 pb-4 text-sm text-muted">Nobody has submitted this passage yet.</p>
          ) : (
            <div className="overflow-x-auto px-4 pt-3 pb-4">
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className="pr-3 text-left font-normal text-muted">Question</th>
                    {heat.questions.map((q) => (
                      <th key={q.number} className="px-0.5 text-center font-medium tabular-nums">{q.number}</th>
                    ))}
                    <th className="pl-3 text-right font-normal text-muted">Score</th>
                    <th className="pl-3 text-right font-normal text-muted">Time</th>
                    <th className="pl-3 text-left font-normal text-muted">Integrity</th>
                  </tr>
                  <tr>
                    <th className="pr-3 text-left text-xs font-normal text-muted">Wrong first try</th>
                    {heat.questions.map((q) => (
                      <th
                        key={q.number}
                        className={cx("px-0.5 text-center text-xs font-semibold tabular-nums", q.share >= 0.6 ? "text-bad" : q.share >= 0.3 ? "text-warn" : "text-muted")}
                        title={`${q.wrong} of ${heat.submitted} wrong on the first try`}
                      >
                        {Math.round(q.share * 100)}%
                      </th>
                    ))}
                    <th colSpan={3} />
                  </tr>
                </thead>
                <tbody>
                  {heat.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-0.5 pr-3 whitespace-nowrap">
                        <Link href={`${base}/students/${r.id}?p=${passageId}`}>{r.name}</Link>
                        {r.stuck.length > 0 && <span className="ml-1 text-xs text-bad">stuck on {r.stuck.join(", ")}</span>}
                      </td>
                      {r.cells.map((c, i) => (
                        <td key={i} className="px-0.5 py-0.5">
                          <HeatCellView cell={c} answered={r.answeredCount} />
                        </td>
                      ))}
                      <td className="pl-3 text-right tabular-nums text-muted">{r.submitted ? `${r.firstCorrect}/${r.total}` : "–"}</td>
                      <td className="pl-3 text-right tabular-nums text-muted">{r.submitted && r.seconds !== null ? clock(r.seconds) : "–"}</td>
                      <td className="pl-3"><IntegrityBadge badge={r.badge} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted">
                <span className="text-good">■</span> right first time · <span className="text-[#f0a020]">■</span> corrected (number = tries) · <span className="text-bad">■</span> still wrong ·{" "}
                <span className="text-muted">▨</span> blank because the test was auto-finished. Hover a cell for the first answer, time, order, proof and reason.
                Questions most of the class got wrong are the ones to go through in your next lesson.
              </p>
            </div>
          )}
        </Card>
      )}

      {heat && heat.magnets.length > 0 && (
        <Card>
          <p className="font-semibold">Mistake magnets</p>
          <p className="text-sm text-muted">Where many students chose the same wrong answer on the first try: a trap worth going through in class.</p>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="py-1.5 pr-3 font-normal">Question</th>
                <th className="py-1.5 pr-3 font-normal">Same wrong answer</th>
                <th className="py-1.5 text-right font-normal">Students</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {heat.magnets.map((m) => (
                <tr key={m.number}>
                  <td className="py-1.5 pr-3 tabular-nums">{m.number}</td>
                  <td className="py-1.5 pr-3 font-medium text-bad">{m.answer}</td>
                  <td className="py-1.5 text-right tabular-nums">{m.count} of {heat.submitted} ({Math.round(m.share * 100)}%)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="p-0">
        <p className="px-4 pt-4 font-semibold">Assigned passages</p>
        {assignments.length === 0 ? (
          <p className="px-4 pt-1 pb-4 text-sm text-muted">Nothing assigned yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {assignments.map((a) => {
              const done = a.recipients.filter((r) => r.completedAt).length;
              const late = a.dueAt && a.dueAt < new Date() ? a.recipients.length - done : 0;
              return (
                <li key={a.id} className={cx("flex flex-wrap items-center gap-3 px-4 py-2.5", a.passageId === passageId && "bg-accent-soft")}>
                  <Link href={`${base}?tab=passages&p=${a.passageId}`} className="min-w-0 flex-1 truncate">{a.passage!.title}</Link>
                  <Link href={`${base}?tab=homework&a=${a.id}`} className="text-sm">
                    {done}/{a.recipients.length} done
                  </Link>
                  <span className="text-sm text-muted">
                    {a.dueAt && `due ${formatDay(a.dueAt)}`}
                    {late > 0 && <span className="text-bad"> · {late} late</span>}
                  </span>
                  <DeleteAssignmentButton id={a.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Assign a passage</p>
        <AssignPassageForm classId={classId} passages={passages.map((p) => ({ id: p.id, title: p.title, mine: p.ownerId === teacherId }))} students={students} />
      </Card>
    </div>
  );
}

async function ListeningTab({ classId, students }: { classId: string; students: { id: string; name: string }[] }) {
  const [assignments, lessons] = await Promise.all([
    db.assignment.findMany({
      where: { classId, lessonId: { not: null }, lesson: { archivedAt: null } },
      orderBy: { createdAt: "desc" },
      include: { lesson: { select: { id: true, title: true } }, recipients: { select: { completedAt: true } } },
    }),
    db.listeningLesson.findMany({ where: { archivedAt: null }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);

  return (
    <div className="space-y-4">
      <Card className="p-0">
        <p className="px-4 pt-4 font-semibold">Assigned lessons</p>
        {assignments.length === 0 ? (
          <p className="px-4 pt-1 pb-4 text-sm text-muted">Nothing assigned yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {assignments.map((a) => {
              const done = a.recipients.filter((r) => r.completedAt).length;
              const late = a.dueAt && a.dueAt < new Date() ? a.recipients.length - done : 0;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate">{a.lesson!.title}</span>
                  <Link href={`/teacher/classes/${classId}?tab=homework&a=${a.id}`} className="text-sm">
                    {done}/{a.recipients.length} done
                  </Link>
                  <span className="text-sm text-muted">
                    {a.dueAt && `due ${formatDay(a.dueAt)}`}
                    {late > 0 && <span className="text-bad"> · {late} late</span>}
                  </span>
                  <DeleteAssignmentButton id={a.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <p className="mb-3 font-semibold">Assign a lesson</p>
        <AssignLessonForm classId={classId} lessons={lessons} students={students} />
      </Card>
    </div>
  );
}

/** One heatmap cell, with everything about the student's first answer in its tooltip. */
function HeatCellView({ cell: c, answered }: { cell: HeatCell | null; answered: number }) {
  const status = !c
    ? "Not submitted"
    : c.firstCorrect
      ? "Right first time"
      : c.unansweredAuto
        ? "Blank: the test was auto-finished before this question"
        : c.correct
          ? `Corrected after ${c.tries} tries`
          : `Still wrong after ${c.tries} tries`;
  const tip = c
    ? [
        status,
        `1st answer: ${c.firstAnswer || "(blank)"}`,
        c.timeSec !== null ? `Time spent: ${c.timeSec} s` : null,
        c.orderPos !== null ? `Answer order: #${c.orderPos} of ${answered}` : null,
        c.evidenceParagraph ? `Proof in paragraph ${c.evidenceParagraph}${c.evidenceOk === false ? " (wrong paragraph)" : ""}` : null,
        c.errorTag ? `Reason: ${ERROR_TAG_LABEL[c.errorTag].title}` : null,
      ].filter(Boolean).join("\n")
    : status;
  return (
    <span
      className={cx(
        "block h-6 w-7 rounded-sm text-center text-[11px] leading-6 text-white",
        !c
          ? "bg-grid"
          : c.firstCorrect
            ? "bg-good"
            : c.unansweredAuto && !c.correct
              ? "bg-[repeating-linear-gradient(135deg,#b8bec2_0_3px,#e4e6e9_3px_6px)] text-ink"
              : c.correct
                ? "bg-[#f0a020]"
                : "bg-bad",
      )}
      title={tip}
    >
      {c && !c.firstCorrect ? c.tries : ""}
    </span>
  );
}

const STAGES = {
  reading: [
    { key: "submitted", label: "1st try" },
    { key: "corrected", label: "Prove-it done" },
  ],
  listening: [
    { key: "vocab", label: "Key words read" },
    { key: "submitted", label: "1st try" },
    { key: "corrected", label: "Corrections done" },
  ],
} as const;
const STAGE_ORDER: HomeworkRow["stage"][] = ["none", "vocab", "started", "submitted", "corrected"];
const reached = (row: HomeworkRow, stage: HomeworkRow["stage"]) => STAGE_ORDER.indexOf(row.stage) >= STAGE_ORDER.indexOf(stage);

/**
 * Homework verification: for one assignment, each student's three checks (first try, corrections, vocabulary), the
 * integrity badge and "Require retake".
 */
async function HomeworkTab({ classId, base, selected }: { classId: string; base: string; selected: string | null }) {
  const assignments = await db.assignment.findMany({
    where: { classId, OR: [{ passage: { archivedAt: null } }, { lesson: { archivedAt: null } }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, dueAt: true, passage: { select: { title: true } }, lesson: { select: { title: true } }, recipients: { select: { completedAt: true, integrityFlagged: true } } },
  });
  if (!assignments.length) return <Card className="py-8 text-center text-muted">Nothing assigned yet. Assign a passage or a lesson from their tabs.</Card>;
  const id = assignments.some((a) => a.id === selected) ? selected! : assignments[0].id;
  const hw = await homeworkMatrix(classId, id);
  if (!hw) return null;

  return (
    <div className="space-y-4">
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {assignments.map((a) => {
            const done = a.recipients.filter((r) => r.completedAt).length;
            const flagged = a.recipients.filter((r) => r.integrityFlagged).length;
            return (
              <li key={a.id} className={cx("flex flex-wrap items-center gap-3 px-4 py-2", a.id === id && "bg-accent-soft")}>
                <Link href={`${base}?tab=homework&a=${a.id}`} className="min-w-0 flex-1 truncate">
                  <span className="text-xs text-muted">{a.passage ? "Reading" : "Listening"} · </span>
                  {a.passage?.title ?? a.lesson?.title}
                </Link>
                <span className="text-sm text-muted tabular-nums">{done}/{a.recipients.length} done{a.dueAt && ` · due ${formatDay(a.dueAt)}`}</span>
                {flagged > 0 && <Badge tone="bad">{flagged} flagged</Badge>}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-0">
        <div className="px-4 pt-4">
          <p className="font-semibold">{hw.title}</p>
          <p className="text-sm text-muted">
            {POLICY_LABEL[hw.policy]} · {hw.requireVocabFirst ? (hw.kind === "reading" ? "vocabulary required (today's cards in the passage deck)" : "vocabulary required (key words read)") : "vocabulary not required"}
            {hw.dueAt && ` · due ${formatDay(hw.dueAt)}`}
          </p>
        </div>
        <div className="overflow-x-auto px-4 pt-3 pb-4">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="py-1.5 pr-3 font-normal">Student</th>
                <th className="py-1.5 pr-3 font-normal">{hw.kind === "reading" ? "Reading" : "Listening"}</th>
                <th className="py-1.5 pr-3 font-normal">Vocabulary</th>
                <th className="py-1.5 pr-3 font-normal">Integrity</th>
                <th className="py-1.5 pr-3 font-normal">Homework</th>
                <th className="py-1.5 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {hw.rows.map((r) => (
                <tr key={r.studentId}>
                  <td className="py-2 pr-3"><Link href={`${base}/students/${r.studentId}`}>{r.name}</Link></td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {STAGES[hw.kind].map((st) => (
                        <Badge key={st.key} tone={reached(r, st.key) ? "good" : r.stage === "started" && st.key === "submitted" ? "warn" : "neutral"}>
                          {reached(r, st.key) ? "✓ " : ""}
                          {st.label}
                          {st.key === "submitted" && r.firstCorrect !== null && reached(r, "submitted") && ` ${r.firstCorrect}/${r.total}${r.band !== null ? ` · ${r.band}` : ""}`}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {r.stage === "none" ? "Not started" : r.stage === "started" ? "Test in progress" : r.stage === "submitted" ? `${r.red} red${r.untagged ? `, ${r.untagged} to tag` : ""}` : ""}
                      {r.wrongParagraphProofs > 0 && <span className="text-warn"> {r.wrongParagraphProofs} proof{r.wrongParagraphProofs === 1 ? "" : "s"} in the wrong paragraph</span>}
                    </p>
                  </td>
                  <td className="py-2 pr-3">
                    {r.deck ? (
                      <div className="space-y-0.5 text-xs">
                        <p>
                          <span className={cx("font-medium", r.vocabAt ? "text-good" : "text-ink")}>{r.vocabAt ? "✓ Cleared today" : "Today"}</span>{" "}
                          <span className="tabular-nums text-muted">{r.deck.reviewedToday}/{r.deck.dueToday} due cards</span>
                        </p>
                        <p className="tabular-nums text-muted">
                          Deck: {r.deck.total ? Math.round((r.deck.known / r.deck.total) * 100) : 0}% known · {r.deck.learning} learning · {r.deck.seen}/{r.deck.total} seen
                        </p>
                        {hw.kind === "reading" && <p className="tabular-nums text-muted">{r.deck.highlights} card{r.deck.highlights === 1 ? "" : "s"} from highlights</p>}
                        <ReviewSpeed review={r.review} />
                      </div>
                    ) : (
                      <div className="text-xs">
                        <p className={r.vocabAt ? "text-good" : "text-muted"}>
                          {hw.kind === "listening" ? (reached(r, "vocab") ? "✓ Key words read" : "Key words not read") : r.vocabAt ? "✓ Done" : "No deck to study"}
                        </p>
                        <ReviewSpeed review={r.review} />
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3"><IntegrityBadge badge={r.badge} detailed /></td>
                  <td className="py-2 pr-3">{r.done ? <Badge tone="good">Done</Badge> : <Badge>Not done</Badge>}</td>
                  <td className="py-2 text-right">
                    {r.attemptId && <RetakeButton kind={hw.kind === "reading" ? "passage" : "lesson"} attemptId={r.attemptId} name={r.name} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            Done means: first try submitted, every red answer corrected{hw.kind === "reading" ? " with a highlighted proof and its reason tagged" : ""}
            {hw.requireVocabFirst ? ", and the vocabulary cleared" : ""}. Integrity flags are signals to check, not proof: a student may have a good reason.
          </p>
        </div>
      </Card>
    </div>
  );
}

export default function ClassPage(props: PageProps<"/teacher/classes/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClassContent {...props} />
    </Suspense>
  );
}
