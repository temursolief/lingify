"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { markVocabularySeen, recheckAnswer, restartLesson, startListeningTest, submitLesson } from "@/app/actions/listening";
import { ActivityTracker } from "@/components/activity-tracker";
import { IntegrityBanner } from "@/components/integrity-banner";
import { LiteVideo } from "@/components/lite-video";
import { NotesText } from "@/components/notes-text";
import { SummaryText } from "@/components/summary-text";
import { PreTestGateModal } from "@/components/pre-test-gate-modal";
import { ProctorWarningOverlay, SubmittingOverlay } from "@/components/test-proctor";
import { Button, cx } from "@/components/ui";
import type { ListeningView } from "@/lib/listening";
import { GROUP_LABEL, paragraphLetter, type PublicGroup } from "@/lib/passage-format";
import type { LessonSubmission } from "@/lib/submissions";
import type { IntegrityEvent, ProctoringPolicy, SubmissionReason } from "@/lib/telemetry";
import { clearDraft, loadDraft, saveDraft } from "@/lib/test-draft";
import { useQuestionTelemetry } from "@/lib/use-question-telemetry";
import { exitFullscreen, useTestProctor } from "@/lib/use-test-proctor";

type Vocab = { word: string; meaning: string; uz?: string; example?: string };
type QState = ListeningView["questions"][number];

/**
 * A Listening Comprehension lesson: the video and its key words on the left, the questions on the right, question
 * numbers along the bottom. On a phone it is one column: the video stays at the top while the questions scroll. The first submission gives the score. Red answers are never corrected for the student:
 * they replay the video and try a new answer until it turns green.
 *
 * The first try is proctored like a reading passage (`useTestProctor`), after the key-word gate and a Start gate;
 * the questions come from the server only at Start. Focus moving into the video frame is not leaving the test.
 */
export function ListeningLesson({
  lesson,
  groups: initialGroups,
  vocabulary,
  initial,
  policy,
}: {
  lesson: { id: string; title: string; videoId: string };
  groups: PublicGroup[] | null;
  vocabulary: Vocab[];
  initial: ListeningView;
  policy: ProctoringPolicy;
}) {
  const [view, setView] = useState(initial);
  const [groups, setGroups] = useState(initialGroups);
  const [answers, setAnswers] = useState<Record<number, string>>(() => Object.fromEntries(Object.entries(initial.questions).map(([n, q]) => [n, q.answer])));
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [active, setActive] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [startError, setStartError] = useState("");
  const [sending, setSending] = useState<"idle" | "sending" | "failed">("idle");
  const numbers = useMemo(() => (groups ?? []).flatMap((g) => g.questions.map((q) => q.number)), [groups]);
  const states = view.questions;
  const red = Object.values(states).filter((q) => !q.correct).length;
  // A lesson with no key words has nothing to gate on.
  const gated = vocabulary.length > 0 && !view.vocabRead;
  const firstTry = !view.submitted;
  const testOn = firstTry && startedAtMs !== null;
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<number | null>(null);
  const answersRef = useRef(answers);
  const finishing = useRef(false);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const telemetry = useQuestionTelemetry({ attemptId: view.id, running: testOn, startedAtMs });
  const eventsRef = useRef<() => IntegrityEvent[]>(() => []);
  const payload = useCallback(
    (reason: SubmissionReason): LessonSubmission => ({
      attemptId: view.id,
      answers: Object.fromEntries(Object.entries(answersRef.current).map(([k, v]) => [k, v ?? ""])),
      meta: { reason, events: eventsRef.current(), telemetry: telemetry.snapshot(true) },
    }),
    [view.id, telemetry],
  );
  /** The first submission, whatever ended the test; kept on the device and sent again until the server has it. */
  const send = useCallback((body: LessonSubmission) => {
    if (finishing.current) return;
    finishing.current = true;
    saveDraft(body.attemptId, { pending: body });
    setSending("sending");
    const go = () =>
      submitLesson(body).then(
        (v) => {
          clearDraft(body.attemptId);
          setView(v);
          setSending("idle");
        },
        () => {
          setSending("failed");
          setTimeout(go, 5000);
        },
      );
    void go();
  }, []);
  const finish = useCallback((reason: SubmissionReason) => send(payload(reason)), [send, payload]);
  const beacon = useCallback(
    (reason: SubmissionReason) => navigator.sendBeacon?.("/api/attempt-terminate", new Blob([JSON.stringify({ kind: "lesson", ...payload(reason) })], { type: "application/json" })),
    [payload],
  );
  const proctor = useTestProctor({
    attemptId: view.id,
    policy,
    kind: "listening",
    enabled: testOn,
    rootRef,
    elapsedMs: telemetry.elapsedMs,
    activeQuestion: () => activeRef.current,
    onFinish: finish,
    beacon,
  });
  useEffect(() => {
    eventsRef.current = proctor.events;
  }, [proctor.events]);

  // Opened again after a started test was never submitted: under a lock, leaving ended it, so it is submitted now.
  const resumedOnce = useRef(false);
  useEffect(() => {
    if (resumedOnce.current || view.submitted || !initial.started) return;
    resumedOnce.current = true;
    const draft = loadDraft(view.id);
    if (draft.pending) send(draft.pending as LessonSubmission);
    else if (policy !== "NONE") {
      send({ attemptId: view.id, answers: Object.fromEntries(Object.entries(draft.answers ?? {}).map(([k, v]) => [k, String(v ?? "")])), meta: { reason: "TAB_HIDDEN", events: draft.events ?? [], telemetry: telemetry.snapshot(true) } });
    }
  }, [initial.started, policy, send, telemetry, view.id, view.submitted]);

  const begin = () => {
    setStartError("");
    void proctor.start(); // first: fullscreen needs the click
    const saved = loadDraft(view.id).answers;
    if (saved) setAnswers((a) => ({ ...a, ...saved }));
    setStartedAtMs(Date.now());
    start(async () => {
      try {
        const r = await startListeningTest(view.id);
        setView(r.view);
        setGroups(r.groups);
      } catch {
        setStartedAtMs(null);
        exitFullscreen();
        setStartError("No connection: the questions could not be loaded. Try again when you are online.");
      }
    });
  };

  const focus = (n: number) => {
    setActive(n);
    activeRef.current = n;
    telemetry.focusQuestion(n);
  };
  const set = (n: number, v: string) => {
    setAnswers((a) => {
      const next = { ...a, [n]: v };
      if (!view.submitted) saveDraft(view.id, { answers: next });
      return next;
    });
    if (firstTry) telemetry.answered(n, v);
  };
  const submit = () => finish("NORMAL");
  const recheck = (n: number) =>
    start(async () => {
      const r = await recheckAnswer({ attemptId: view.id, number: n, answer: answers[n] ?? "" });
      setView(r.view);
      setErrors((e) => ({ ...e, [n]: r.error ?? "" }));
    });
  const again = () =>
    start(async () => {
      setView(await restartLesson(lesson.id));
      finishing.current = false;
      setStartedAtMs(null);
      setAnswers({});
      setErrors({});
    });
  const readVocab = () => start(async () => setView(await markVocabularySeen(view.id)));
  const jump = (n: number) => {
    setActive(n);
    document.getElementById(`q${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Render functions (not inner components), so inputs keep focus while the student types.
  const locked = (n: number) => view.submitted && !!states[n]?.correct;
  const gap = (n: number) => (
    <input
      value={answers[n] ?? ""}
      disabled={locked(n)}
      onChange={(e) => set(n, e.target.value)}
      onFocus={() => focus(n)}
      autoComplete="off"
      spellCheck={false}
      aria-label={`Answer ${n}`}
      className={cx(
        "mx-1 w-40 max-w-full rounded-md bg-surface px-2 py-0.5 ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-accent",
        !view.submitted || !states[n] ? "ring-line" : states[n].correct ? "bg-good-soft text-good ring-good" : "bg-bad-soft text-bad ring-bad",
      )}
    />
  );
  const options = (n: number, opts: { value: string; label: string }[]) => {
    const s = states[n];
    const wrong = new Set((s?.wrong ?? []).map((w) => w.toUpperCase()));
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const v = o.value.toUpperCase();
          const chosen = (answers[n] ?? "").toUpperCase() === v;
          const triedWrong = view.submitted && wrong.has(v);
          return (
            <button
              key={o.value}
              type="button"
              disabled={locked(n) || triedWrong}
              onClick={() => {
                set(n, o.value);
                focus(n);
              }}
              className={cx(
                "rounded-md px-3 py-1.5 text-left text-sm ring-1 ring-inset transition-colors",
                s?.correct && s.answer.toUpperCase() === v
                  ? "bg-good-soft text-good ring-good"
                  : triedWrong
                    ? "bg-bad-soft text-bad line-through ring-bad"
                    : chosen
                      ? "bg-[var(--color-accent-700)] text-[var(--color-accent-100)] ring-accent"
                      : "bg-surface ring-line hover:bg-hover",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  };
  const footer = (n: number) => (
    <Footer
      n={n}
      state={view.submitted ? states[n] : undefined}
      changed={!!(answers[n] ?? "").trim() && (answers[n] ?? "").trim().toLowerCase() !== (states[n]?.answer ?? "").toLowerCase()}
      error={errors[n]}
      pending={pending}
      onCheck={() => recheck(n)}
    />
  );

  const renderGroup = (g: PublicGroup): ReactNode => {
    switch (g.type) {
      case "tfng":
      case "ynng":
      case "matching": {
        const opts = (g.type === "ynng" ? ["YES", "NO", "NOT GIVEN"] : ["TRUE", "FALSE", "NOT GIVEN"]).map((v) => ({ value: v, label: v }));
        return (
          <ol className="space-y-4">
            {g.questions.map((q) => (
              <li key={q.number} id={`q${q.number}`}>
                <p><b>{q.number}</b> {q.statement}</p>
                {options(q.number, opts)}
                {footer(q.number)}
              </li>
            ))}
          </ol>
        );
      }
      case "mcq":
        return (
          <ol className="space-y-4">
            {g.questions.map((q) => (
              <li key={q.number} id={`q${q.number}`}>
                <p><b>{q.number}</b> {q.question}</p>
                {options(q.number, q.options.map((o, i) => ({ value: paragraphLetter(i), label: `${paragraphLetter(i)}  ${o}` })))}
                {footer(q.number)}
              </li>
            ))}
          </ol>
        );
      case "completion":
        return (
          <ol className="space-y-4">
            {g.questions.map((q) => {
              const [before, after] = q.text.split("___");
              return (
                <li key={q.number} id={`q${q.number}`}>
                  <p className="leading-loose"><b>{q.number}</b> {before}{gap(q.number)}{after}</p>
                  {footer(q.number)}
                </li>
              );
            })}
          </ol>
        );
      case "summary":
      case "notes":
        return (
          <div>
            {g.type === "notes" ? (
              <NotesText title={g.title} text={g.text} gap={(n) => <span id={`q${n}`}><b className="text-sm">{n}</b>{gap(n)}</span>} />
            ) : (
              <SummaryText title={g.title} text={g.text} gap={(n) => <span id={`q${n}`}><b className="text-sm">({n})</b>{gap(n)}</span>} />
            )}
            {view.submitted && (
              <div className="mt-2 space-y-3">
                {g.questions.map((q) => (
                  <div key={q.number}>
                    <p className="text-sm font-semibold">Question {q.number}</p>
                    {footer(q.number)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  if (!gated && firstTry && (startedAtMs === null || !groups)) {
    return (
      <>
        <PreTestGateModal
          kind="listening"
          title={lesson.title}
          policy={policy}
          resuming={initial.started && policy === "NONE"}
          pending={pending || sending !== "idle" || (initial.started && policy !== "NONE")}
          startLabel="no time limit"
          points={[
            "First try gives your score. Replay as often as you like.",
            "Then correct the red answers.",
          ]}
          onStart={begin}
        />
        {startError && <p className="mx-auto mt-3 max-w-xl text-center text-sm text-bad">{startError}</p>}
        {sending !== "idle" && <SubmittingOverlay failed={sending === "failed"} />}
      </>
    );
  }

  return (
    // During the first try the test covers the whole screen, so no link in the app is one click away.
    <div ref={rootRef} className={cx("flex flex-col", testOn ? "fixed inset-0 z-40 bg-page" : "pane-fill")}>
      {!view.completed && <ActivityTracker activity="IELTS" />}
      <div className="pane-x flex min-h-14 shrink-0 items-center gap-3 border-b border-line bg-bar py-2 md:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{lesson.title}</h1>
          <p className="truncate text-sm text-muted">
            {gated
              ? "Read the key words first"
              : !view.submitted
                ? `${Object.values(answers).filter((a) => a?.trim()).length} of ${numbers.length} answered`
                : view.completed
                  ? `Complete · first try ${view.firstCorrect}/${view.total} · estimated band ${view.band}`
                  : `First try ${view.firstCorrect}/${view.total} · band ${view.band} · ${red} to correct`}
          </p>
        </div>
        {gated ? null : !view.submitted ? (
          <Button className="max-md:px-3" onClick={submit} disabled={pending}>
            {pending ? "Checking…" : <>Submit<span className="max-md:hidden"> answers</span></>}
          </Button>
        ) : view.completed ? (
          <Button variant="secondary" className="max-md:px-3" onClick={again} disabled={pending}>Practise again</Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain md:grid md:grid-cols-2 md:overflow-hidden">
        {/* Below md this box disappears (display: contents) and its parts are ordered around the questions. */}
        <div className="contents md:block md:min-h-0 md:space-y-4 md:overflow-y-auto md:border-r md:border-line md:bg-surface md:px-6 md:py-6">
          <div className="sticky top-0 z-10 order-1 bg-surface px-2 py-2 shadow-bubble md:static md:p-0 md:shadow-none">
            {/* No taller than about a third of the screen, so the questions stay in view on a phone held sideways. */}
            <div className="mx-auto max-w-[min(100%,56dvh)] md:max-w-none">
              <LiteVideo id={lesson.videoId} title={lesson.title} onEvent={testOn ? telemetry.videoEvent : undefined} allowFullscreen={!testOn} />
            </div>
          </div>
          {gated ? (
            <section className="order-4 mx-4 mb-6 rounded-xl bg-raised p-4 md:m-0">
              <p className="font-medium">Key words</p>
              <VocabList vocabulary={vocabulary} />
              <Button className="mt-3" onClick={readVocab} disabled={pending}>I&apos;ve read these words</Button>
            </section>
          ) : (
            vocabulary.length > 0 && (
              // Kept on screen for the whole practice; folded during the timed first try so the video and questions lead.
              <details key={testOn ? "test" : "open"} open={!testOn} className="group order-4 mx-4 mb-6 rounded-xl bg-raised p-4 md:m-0">
                <summary className="cursor-pointer font-medium select-none">
                  Key words <span className="text-sm font-normal text-muted">· {vocabulary.length}</span>
                </summary>
                <VocabList vocabulary={vocabulary} />
              </details>
            )
          )}
        </div>

        <div className="pane-x order-3 py-5 md:min-h-0 md:overflow-y-auto md:py-6">
          {gated ? (
            <p className="text-muted">Read the key words first.</p>
          ) : (
            <>
              {view.submitted && <IntegrityBanner kind="listening" reason={view.reason} firstCorrect={view.firstCorrect} total={view.total} band={view.band} />}
              {view.completed && (
                <div className="mb-6 rounded-xl bg-good-soft p-4 text-good">
                  <p className="font-semibold">Lesson complete</p>
                  <p className="mt-1 text-sm">
                    First try: {view.firstCorrect} of {view.total} (band {view.band}).{" "}
                    <Link href="/student/listening" className="text-good underline">Back to the library</Link>
                  </p>
                </div>
              )}
              {view.submitted && !view.completed && (
                <div className="mb-6 rounded-xl bg-paper p-4 text-sm">
                  <p className="font-medium">Correct the red answers</p>
                  <p className="mt-1 text-muted">Listen again, then press Check.</p>
                </div>
              )}
              <div className="space-y-8">
                {(groups ?? []).map((g, gi) => (
                  <section key={gi}>
                    <h2 className="font-semibold">
                      Questions {g.questions[0].number}
                      {g.questions.length > 1 && `–${g.questions[g.questions.length - 1].number}`}
                      <span className="ml-2 text-sm font-normal text-muted">{GROUP_LABEL[g.type]}</span>
                    </h2>
                    <p className="mt-1 mb-3 text-sm text-muted">{g.instructions}</p>
                    {renderGroup(g)}
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {!gated && (
        <nav className="pane-x flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-line bg-bar py-2 md:flex-wrap md:overflow-visible" aria-label="Questions">
          {numbers.map((n) => {
            const s = view.submitted ? states[n] : undefined;
            const answered = !!answers[n]?.trim();
            return (
              <button
                key={n}
                type="button"
                onClick={() => jump(n)}
                aria-label={`Question ${n}${s ? (s.correct ? ", correct" : ", incorrect") : answered ? ", answered" : ""}`}
                className={cx(
                  "h-8 min-w-8 shrink-0 rounded-md px-1.5 text-sm font-medium tabular-nums",
                  s ? (s.correct ? "bg-good-soft text-good" : "bg-bad-soft text-bad") : answered ? "bg-accent-soft text-accent" : "bg-paper text-muted",
                  active === n && "outline-2 outline-offset-2 outline-ink",
                )}
              >
                {n}
              </button>
            );
          })}
          {view.submitted && (
            <span className="ml-auto text-sm text-muted max-md:hidden"><span className="text-good">●</span> correct <span className="ml-2 text-bad">●</span> incorrect</span>
          )}
        </nav>
      )}
      {proctor.warning && <ProctorWarningOverlay warning={proctor.warning} fullscreen={proctor.needsFullscreen} onResume={proctor.resume} />}
      {sending !== "idle" && <SubmittingOverlay failed={sending === "failed"} />}
    </div>
  );
}

function Footer({ n, state, changed, error, pending, onCheck }: { n: number; state?: QState; changed: boolean; error?: string; pending: boolean; onCheck: () => void }) {
  if (!state) return null;
  if (state.correct) return <p className="mt-2 text-sm font-medium text-good">✓ Correct{!state.firstCorrect && ` on try ${state.tries}`}</p>;
  return (
    <div className="mt-2 text-sm">
      <p className="font-medium text-bad">✗ Not correct{state.tries > 1 && ` · ${state.tries} tries`}.</p>
      {error && <p className="mt-1 text-bad">{error}</p>}
      <Button className="mt-2 px-3 py-1.5 text-sm" disabled={pending || !changed} onClick={onCheck}>Check question {n}</Button>
    </div>
  );
}

function VocabList({ vocabulary }: { vocabulary: Vocab[] }) {
  return (
    <ul className="mt-2 space-y-2.5">
      {vocabulary.map((v) => (
        <li key={v.word}>
          <p>
            <b className="font-medium">{v.word}</b> <span className="text-muted">· {v.meaning}</span>
          </p>
          {v.uz && <p className="text-sm text-[var(--color-accent-300)]">O‘zbekcha: {v.uz}</p>}
          {v.example && <p className="font-serif text-sm text-muted italic">“{v.example}”</p>}
        </li>
      ))}
    </ul>
  );
}
