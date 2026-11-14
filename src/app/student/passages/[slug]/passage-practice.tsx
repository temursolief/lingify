"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addChunkCard, explainChunkCard } from "@/app/actions/cards";
import { startTest } from "@/app/actions/passage";
import { ActivityTracker } from "@/components/activity-tracker";
import { IntegrityBanner } from "@/components/integrity-banner";
import { PreTestGateModal } from "@/components/pre-test-gate-modal";
import { ProctorWarningOverlay, SubmittingOverlay } from "@/components/test-proctor";
import { Button, cx } from "@/components/ui";
import { GROUP_LABEL, type PublicGroup } from "@/lib/passage-format";
import type { AttemptView, Evidence } from "@/lib/passages";
import type { PassageSubmission } from "@/lib/submissions";
import type { IntegrityEvent, ProctoringPolicy, SubmissionReason } from "@/lib/telemetry";
import { loadDraft } from "@/lib/test-draft";
import { useQuestionTelemetry } from "@/lib/use-question-telemetry";
import { exitFullscreen, useTestProctor } from "@/lib/use-test-proctor";
import { CardToast, type Toast } from "./card-toast";
import { PassageText } from "./passage-text";
import { QuestionFooter } from "./question-footer";
import { Group } from "./question-group";
import { Timer } from "./timer";
import { useAttempt } from "./use-attempt";
import { useHighlights } from "./use-highlights";

type Passage = { id: string; title: string; timeLimit: number; paragraphs: string[] };

/**
 * An IELTS reading passage: a timed, proctored first try, then "Prove it" corrections. The questions arrive from the
 * server only when the student presses Start (`groups` is null before that).
 */
export function PassagePractice({ passage, groups: initialGroups, initial, policy }: { passage: Passage; groups: PublicGroup[] | null; initial: AttemptView; policy: ProctoringPolicy }) {
  const attempt = useAttempt(passage.id, initial);
  const { view, answers, proofs, errors, stateOf, pending, setAnswer, setProof } = attempt;
  const [groups, setGroups] = useState(initialGroups);
  // When the test started by this device's clock; set from the server's elapsed time for a resumed test.
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [resumeOffset] = useState(() => (initial.elapsedSec !== null ? initial.elapsedSec * 1000 : null));
  const [startError, setStartError] = useState("");
  const [starting, startStarting] = useTransition();
  const [active, setActive] = useState<number | null>(null);
  // On a phone the passage and the questions take turns; from a tablet up they sit side by side.
  const [tab, setTab] = useState<"passage" | "questions">("passage");
  const [toast, setToast] = useState<Toast | null>(null);
  const [cardPending, startCard] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const passageRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<number | null>(null);
  const { selection, clear: clearSelection } = useHighlights(passage.paragraphs, passageRef);

  const firstTry = !view.submitted;
  const testOn = firstTry && startedAtMs !== null;
  const telemetry = useQuestionTelemetry({ attemptId: view.id, running: testOn, startedAtMs });

  const eventsRef = useRef<() => IntegrityEvent[]>(() => []);
  const payload = useCallback(
    (reason: SubmissionReason) => attempt.submission({ reason, events: eventsRef.current(), telemetry: telemetry.snapshot() }, telemetry.elapsedMs() / 1000),
    [attempt, telemetry],
  );
  const finish = useCallback((reason: SubmissionReason) => attempt.finish(payload(reason)), [attempt, payload]);
  const beacon = useCallback(
    (reason: SubmissionReason) => {
      const body = JSON.stringify({ kind: "passage", ...payload(reason) });
      navigator.sendBeacon?.("/api/attempt-terminate", new Blob([body], { type: "application/json" }));
    },
    [payload],
  );

  const proctor = useTestProctor({
    attemptId: view.id,
    policy,
    kind: "reading",
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

  // Opened again after the test had started and was never submitted (the tab closed or reloaded before anything was
  // sent): under a lock, leaving the page ended the test, so it is submitted now with what was saved on the device.
  const resumedOnce = useRef(false);
  useEffect(() => {
    if (resumedOnce.current || view.submitted || !initial.started) return;
    resumedOnce.current = true;
    const draft = loadDraft(view.id);
    if (draft.pending) attempt.finish(draft.pending as PassageSubmission);
    else if (policy !== "NONE") {
      const answersNow = Object.fromEntries(Object.entries(draft.answers ?? {}).map(([k, v]) => [k, String(v ?? "")]));
      attempt.finish({ ...attempt.submission({ reason: "TAB_HIDDEN", events: draft.events ?? [], telemetry: telemetry.snapshot() }, initial.elapsedSec ?? 0), answers: answersNow, evidence: (draft.proofs ?? {}) as Record<string, Evidence> });
    }
  }, [attempt, initial.started, initial.elapsedSec, policy, telemetry, view.id, view.submitted]);

  const begin = () => {
    setStartError("");
    void proctor.start(); // first: fullscreen needs the click
    attempt.restoreDraft();
    setStartedAtMs(Date.now() - (resumeOffset ?? 0));
    startStarting(async () => {
      try {
        const r = await startTest({ attemptId: view.id, passageId: passage.id });
        attempt.setView(r.view);
        setGroups(r.groups);
      } catch {
        // The questions come from the server: without a connection the test cannot start, and nothing is counted.
        setStartedAtMs(null);
        exitFullscreen();
        setStartError("No connection: the questions could not be loaded. Try again when you are online.");
      }
    });
  };

  const onTick = useCallback(() => {}, []);
  const onTimeUp = useCallback(() => finish("TIMER_EXPIRED"), [finish]);

  const numbers = useMemo(() => (groups ?? []).flatMap((g) => g.questions.map((q) => q.number)), [groups]);

  const focusQuestion = (n: number) => {
    setActive(n);
    activeRef.current = n;
    telemetry.focusQuestion(n);
  };

  const makeCard = (ev: Evidence) =>
    startCard(async () => {
      clearSelection();
      const input = { passageId: passage.id, paragraph: ev.paragraph, start: ev.start, end: ev.end };
      const r = await addChunkCard(input);
      setToast("error" in r ? r : { id: r.id, chunk: r.chunk, meaning: r.meaning, uz: r.uz, pending: r.pending });
      // The card is saved; its meaning follows a moment later, without holding up the next highlight.
      if ("error" in r || !r.pending) return;
      explainChunkCard(r.id, input)
        .catch(() => null)
        .then((explained) => setToast((t) => (t && "id" in t && t.id === r.id ? { ...t, ...explained, pending: false } : t)));
    });

  const setProofFor = (n: number, ev: Evidence) => {
    setProof(n, ev);
    clearSelection();
    setTab("questions");
  };

  const jump = (n: number) => {
    focusQuestion(n);
    setTab("questions");
    // After the questions are on screen (on a phone they may have been behind the passage).
    requestAnimationFrame(() => document.getElementById(`q${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  /** "Prove a new answer": the student goes to the passage to highlight the sentence. */
  const prove = (n: number) => {
    focusQuestion(n);
    setTab("passage");
  };

  if (firstTry && (startedAtMs === null || !groups)) {
    const resuming = initial.started && policy === "NONE";
    return (
      <>
        <PreTestGateModal
          kind="reading"
          title={passage.title}
          policy={policy}
          resuming={resuming}
          pending={starting || attempt.sending !== "idle" || (initial.started && policy !== "NONE")}
          startLabel={`${passage.timeLimit}:00`}
          points={[
            <>{groups ? `${numbers.length} questions` : "The questions"} in <b>{passage.timeLimit} minutes</b>, . First try gives your score.</>,
            <>Then fix red answers: <b>highlight the proof</b>.</>,
          ]}
          onStart={begin}
        />
        {startError && <p className="mx-auto mt-3 max-w-xl text-center text-sm text-bad">{startError}</p>}
        {attempt.sending !== "idle" && <SubmittingOverlay failed={attempt.sending === "failed"} />}
      </>
    );
  }

  const shownGroups = groups ?? [];
  const red = view.questions.filter((q) => !q.correct).length;
  const needTags = view.questions.filter((q) => q.correct && !q.firstCorrect && !q.errorTag).length;

  return (
    // During the first try the test covers the whole screen, so no link in the app is one click away.
    <div ref={rootRef} className={cx("flex flex-col", testOn ? "fixed inset-0 z-40 bg-page" : "pane-fill")}>
      {!view.completed && <ActivityTracker activity="IELTS" />}

      <div className="pane-x flex min-h-14 shrink-0 items-center gap-3 border-b border-line bg-bar py-2 md:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{passage.title}</h1>
          <p className="truncate text-sm text-muted">
            {!view.submitted
              ? `${Object.values(answers).filter((a) => a?.trim()).length} of ${numbers.length} answered${policy !== "NONE" ? " · test lock on" : ""}`
              : view.completed
                ? `Complete · first try ${view.firstCorrect}/${view.total} · estimated band ${view.band}`
                : `First try ${view.firstCorrect}/${view.total} · band ${view.band} · ${red ? `${red} to correct` : `${needTags} to explain`}`}
          </p>
        </div>
        {!view.submitted && startedAtMs !== null ? (
          <>
            <Timer seconds={passage.timeLimit * 60} startedAtMs={startedAtMs} onTick={onTick} onEnd={onTimeUp} />
            <Button className="max-md:px-3" onClick={() => finish("NORMAL")} disabled={attempt.sending !== "idle"}>
              {attempt.sending !== "idle" ? "Checking…" : <>Submit<span className="max-md:hidden"> answers</span></>}
            </Button>
          </>
        ) : view.completed ? (
          <Button variant="secondary" className="max-md:px-3" onClick={() => attempt.again(() => { setStartedAtMs(null); setTab("passage"); })} disabled={pending}>Practise again</Button>
        ) : null}
      </div>

      <div className="flex shrink-0 border-b border-line bg-bar md:hidden" role="tablist">
        {(["passage", "questions"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx("h-10 flex-1 border-b-2 text-sm font-medium", tab === t ? "border-accent text-accent" : "border-transparent text-muted")}
          >
            {t === "passage" ? "Passage" : view.submitted && red ? `Questions · ${red} to correct` : "Questions"}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-2">
        <div ref={passageRef} className={cx("relative min-h-0 overflow-y-auto overscroll-contain border-line bg-surface px-4 py-4 md:border-r md:px-8 md:py-6", tab !== "passage" && "max-md:hidden")}>
          <p className="mb-4 text-xs text-muted">
            {active !== null && view.submitted && stateOf.get(active) && !stateOf.get(active)!.correct
              ? `Highlight proof for question ${active}.`
              : `Highlight words to make a flashcard${view.submitted && red ? " or proof" : ""}.`}
          </p>
          <PassageText paragraphs={passage.paragraphs} proofs={proofs} stateOf={stateOf} />

          {selection && (
            <div
              className="absolute z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1 rounded-lg bg-raised p-1 font-sans text-sm text-ink shadow-float"
              style={{ top: selection.top, left: selection.left }}
              onMouseUp={(e) => e.stopPropagation()}
            >
              <button type="button" className="rounded-md px-2.5 py-1 hover:bg-hover" onClick={() => makeCard(selection.evidence)} disabled={cardPending}>
                Make flashcard
              </button>
              {active !== null && (!view.submitted || (stateOf.get(active) && !stateOf.get(active)!.correct)) && (
                <button type="button" className="rounded-md px-2.5 py-1 hover:bg-hover" onClick={() => setProofFor(active, selection.evidence)}>
                  Proof for question {active}
                </button>
              )}
            </div>
          )}
        </div>

        <div className={cx("pane-x min-h-0 overflow-y-auto overscroll-contain py-5 md:py-6", tab !== "questions" && "max-md:hidden")}>
          {view.submitted && <IntegrityBanner kind="reading" reason={view.reason} firstCorrect={view.firstCorrect} total={view.total} band={view.band} />}
          {view.completed && (
            <div className="mb-6 rounded-xl bg-good-soft p-4 text-good">
              <p className="font-semibold">Passage complete</p>
              <p className="mt-1 text-sm">
                First try: {view.firstCorrect} of {view.total} (band {view.band}).{" "}
                <Link href="/student/progress" className="text-good underline">Your mistakes</Link>
              </p>
            </div>
          )}
          {view.submitted && !view.completed && red > 0 && (
            <div className="mb-6 rounded-xl bg-paper p-4 text-sm">
              <p className="font-medium">Correct the red answers</p>
              <p className="mt-1 text-muted">New answer, highlight proof, press Check.</p>
            </div>
          )}

          <div className="space-y-8">
            {shownGroups.map((g, gi) => (
              <section key={gi}>
                <h2 className="font-semibold">
                  Questions {g.questions[0].number}
                  {g.questions.length > 1 && `–${g.questions[g.questions.length - 1].number}`}
                  <span className="ml-2 text-sm font-normal text-muted">{GROUP_LABEL[g.type]}</span>
                </h2>
                <p className="mt-1 mb-3 text-sm text-muted">{g.instructions}</p>
                <Group
                  group={g}
                  paragraphCount={passage.paragraphs.length}
                  answers={answers}
                  submitted={view.submitted}
                  stateOf={stateOf}
                  onAnswer={(n, v) => {
                    setAnswer(n, v);
                    if (firstTry) telemetry.answered(n, v);
                  }}
                  onFocus={focusQuestion}
                  renderFooter={(n) => (
                    <QuestionFooter
                      n={n}
                      submitted={view.submitted}
                      state={stateOf.get(n)}
                      proof={proofs[n]}
                      active={active === n}
                      error={errors[n]}
                      pending={pending}
                      onActivate={() => prove(n)}
                      onRemoveProof={() => setProof(n, null)}
                      onCheck={() => {
                        // On a phone the passage is behind the other tab: open it, ready for the highlight.
                        if (attempt.retry(n) === "proof-missing") prove(n);
                      }}
                      onTag={(t) => attempt.tag(n, t)}
                    />
                  )}
                />
              </section>
            ))}
          </div>
        </div>
      </div>

      <nav className="pane-x flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-line bg-bar py-2 md:flex-wrap md:overflow-visible" aria-label="Questions">
        {numbers.map((n) => {
          const s = stateOf.get(n);
          const answered = !!answers[n]?.trim();
          return (
            <button
              key={n}
              type="button"
              onClick={() => jump(n)}
              aria-label={`Question ${n}${s ? (s.correct ? ", correct" : ", incorrect") : answered ? ", answered" : ""}`}
              className={cx(
                "h-8 min-w-8 shrink-0 rounded-md px-1.5 text-sm font-medium tabular-nums transition-colors",
                s
                  ? s.correct
                    ? s.firstCorrect || s.errorTag
                      ? "bg-good-soft text-good"
                      : "bg-good-soft text-good ring-2 ring-warn ring-offset-1"
                    : "bg-bad-soft text-bad"
                  : answered
                    ? "bg-accent-soft text-accent"
                    : "bg-paper text-muted",
                active === n && "outline-2 outline-offset-2 outline-ink",
              )}
            >
              {n}
            </button>
          );
        })}
        {view.submitted && (
          <span className="ml-auto text-sm text-muted max-md:hidden">
            <span className="text-good">●</span> correct <span className="ml-2 text-bad">●</span> incorrect
            {needTags > 0 && <><span className="ml-2 text-warn">○</span> say why you missed it</>}
          </span>
        )}
      </nav>

      {toast && <CardToast toast={toast} onClose={() => setToast(null)} />}
      {proctor.warning && <ProctorWarningOverlay warning={proctor.warning} fullscreen={proctor.needsFullscreen} onResume={proctor.resume} />}
      {attempt.sending !== "idle" && <SubmittingOverlay failed={attempt.sending === "failed"} />}
    </div>
  );
}
