"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { addChunkCard, deleteOwnCard, explainChunkCard } from "@/app/actions/cards";
import { restartAttempt, retryAnswer, submitPassage, tagMistake } from "@/app/actions/passage";
import { ActivityTracker } from "@/components/activity-tracker";
import { Button, cx } from "@/components/ui";
import { GROUP_LABEL, paragraphLetter, ROMAN, type PublicGroup } from "@/lib/passage-format";
import type { AttemptView, Evidence, QuestionState } from "@/lib/passages";
import { NotesText } from "@/components/notes-text";

type Passage = { id: string; title: string; timeLimit: number; paragraphs: string[] };
type Tag = "VOCAB" | "DISTRACTOR" | "LOGIC" | "CARELESS";

/** Room kept for the highlight toolbar ("Make flashcard" + "Proof for question 12"). */
const TOOLBAR_WIDTH = 290;

const TAGS: { tag: Tag; title: string; hint: string }[] = [
  { tag: "VOCAB", title: "Vocab / Synonym", hint: "Didn't know a word or missed the paraphrase" },
  { tag: "DISTRACTOR", title: "Trap / Distractor", hint: "Fell for a word-match trick" },
  { tag: "LOGIC", title: "Logic / NG vs False", hint: "Over-inferred or misread the logic" },
  { tag: "CARELESS", title: "Speed / Careless", hint: "Skimmed too fast or misread" },
];

function mmss(s: number) {
  return `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
}

/** Character offset of a DOM point inside a paragraph element (question-number badges are CSS-only, so they don't count). */
function offsetIn(root: HTMLElement, node: Node, offset: number) {
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

type Selection = { top: number; left: number; evidence: Evidence };
type Toast = { id: string; chunk: string; meaning: string; uz: string | null; pending?: boolean } | { error: string };

export function PassagePractice({ passage, groups, initial }: { passage: Passage; groups: PublicGroup[]; initial: AttemptView }) {
  const [view, setView] = useState(initial);
  const [started, setStarted] = useState(initial.submitted);
  const [answers, setAnswers] = useState<Record<number, string>>(() => Object.fromEntries(initial.questions.map((q) => [q.number, q.answer])));
  const [proofs, setProofs] = useState<Record<number, Evidence>>(() =>
    Object.fromEntries(initial.questions.filter((q) => q.evidence).map((q) => [q.number, q.evidence!])),
  );
  const [active, setActive] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  // On a phone the passage and the questions take turns; from a tablet up they sit side by side.
  const [tab, setTab] = useState<"passage" | "questions">("passage");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, start] = useTransition();
  const [cardPending, startCard] = useTransition();
  const elapsed = useRef(0);
  const passageRef = useRef<HTMLDivElement>(null);
  const answersRef = useRef(answers);
  const proofsRef = useRef(proofs);
  useEffect(() => {
    answersRef.current = answers;
    proofsRef.current = proofs;
  }, [answers, proofs]);

  const numbers = useMemo(() => groups.flatMap((g) => g.questions.map((q) => q.number)), [groups]);
  const stateOf = useMemo(() => new Map(view.questions.map((q) => [q.number, q])), [view.questions]);

  const submit = useCallback(() => {
    start(async () => {
      const v = await submitPassage({
        attemptId: view.id,
        passageId: passage.id,
        answers: Object.fromEntries(Object.entries(answersRef.current).map(([k, v]) => [k, v])),
        evidence: Object.fromEntries(Object.entries(proofsRef.current).map(([k, v]) => [k, v])),
        seconds: elapsed.current,
      });
      setView(v);
    });
  }, [view.id, passage.id]);

  const onTick = useCallback((seconds: number) => {
    elapsed.current = seconds;
  }, []);

  // Highlighting in the passage opens a small toolbar: make a flashcard, or use the sentence as proof.
  useEffect(() => {
    const read = () => {
      const sel = window.getSelection();
      const host = passageRef.current;
      if (!sel || sel.isCollapsed || !sel.rangeCount || !host) return setSelection(null);
      const range = sel.getRangeAt(0);
      const para = (range.startContainer.parentElement?.closest("[data-para]") ?? null) as HTMLElement | null;
      const endPara = (range.endContainer.parentElement?.closest("[data-para]") ?? null) as HTMLElement | null;
      if (!para || para !== endPara) return setSelection(null);
      const index = Number(para.dataset.para);
      const start = offsetIn(para, range.startContainer, range.startOffset);
      const end = offsetIn(para, range.endContainer, range.endOffset);
      const text = passage.paragraphs[index].slice(start, end);
      if (!text.trim()) return setSelection(null);
      const box = range.getBoundingClientRect();
      const frame = host.getBoundingClientRect();
      // Kept inside the pane: on a phone a selection near the right edge would push the toolbar off the screen.
      const left = Math.max(8, Math.min(box.left - frame.left, host.clientWidth - TOOLBAR_WIDTH - 8));
      setSelection({ top: box.bottom - frame.top + host.scrollTop + 6, left, evidence: { paragraph: index, start, end, text } });
    };
    // A mouse ends a selection with mouseup. A finger does not: the handles are dragged, so the selection is read
    // once it has stopped changing.
    let touch = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    const onPointer = (e: PointerEvent) => {
      touch = e.pointerType !== "mouse";
    };
    const onChange = () => {
      if (!touch) return;
      clearTimeout(wait);
      wait = setTimeout(read, 350);
    };
    document.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("mouseup", read);
    document.addEventListener("selectionchange", onChange);
    return () => {
      clearTimeout(wait);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("mouseup", read);
      document.removeEventListener("selectionchange", onChange);
    };
  }, [passage.paragraphs]);

  const makeCard = (ev: Evidence) =>
    startCard(async () => {
      setSelection(null);
      window.getSelection()?.removeAllRanges();
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
    setProofs((p) => ({ ...p, [n]: ev }));
    setErrors((e) => ({ ...e, [n]: "" }));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    setTab("questions");
  };

  // The button always answers: a student who has not yet chosen a new answer or highlighted the proof is told so,
  // instead of facing a grey button that does nothing.
  const retry = (n: number) => {
    const answer = (answers[n] ?? "").trim();
    const why = !answer || answer.toUpperCase() === (stateOf.get(n)?.answer ?? "").toUpperCase()
      ? "Choose a different answer first."
      : !proofs[n]
        ? "Now highlight the sentence in the passage that proves your new answer, then press Check."
        : "";
    if (why) {
      setErrors((e) => ({ ...e, [n]: why }));
      // On a phone the passage is behind the other tab: open it, ready for the highlight.
      if (answer && !proofs[n]) prove(n);
      return;
    }
    start(async () => {
      const r = await retryAnswer({ attemptId: view.id, passageId: passage.id, number: n, answer: answers[n] ?? "", evidence: proofs[n] ?? null });
      setView(r.view);
      setErrors((e) => ({ ...e, [n]: r.error ?? "" }));
    });
  };

  const tag = (n: number, t: Tag) =>
    start(async () => {
      setView(await tagMistake({ attemptId: view.id, passageId: passage.id, number: n, tag: t }));
    });

  const again = () =>
    start(async () => {
      const v = await restartAttempt(passage.id);
      setView(v);
      setAnswers({});
      setProofs({});
      setStarted(false);
      setTab("passage");
      elapsed.current = 0;
    });

  const jump = (n: number) => {
    setActive(n);
    setTab("questions");
    // After the questions are on screen (on a phone they may have been behind the passage).
    requestAnimationFrame(() => document.getElementById(`q${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  /** "Prove a new answer": the student goes to the passage to highlight the sentence. */
  const prove = (n: number) => {
    setActive(n);
    setTab("passage");
  };

  if (!started) {
    return (
      <div className="mx-auto max-w-xl md:pt-6">
        <div className="rounded-xl bg-surface p-5 shadow-bubble md:p-6">
          <p className="text-sm text-muted">IELTS Academic Reading</p>
          <h1 className="mt-1 text-xl font-semibold">{passage.title}</h1>
          <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[15px]">
            <li>{numbers.length} questions in <b>{passage.timeLimit} minutes</b>, like the exam. This first try gives your score.</li>
            <li>After you submit, wrong answers turn red. Correct them yourself: the right answer is never shown.</li>
            <li>To check a corrected answer, <b>highlight the sentence that proves it</b> in the passage.</li>
            <li>Highlight any useful phrase to make a flashcard from it.</li>
          </ul>
          <Button className="mt-6 w-full" onClick={() => setStarted(true)}>Start · {passage.timeLimit}:00</Button>
        </div>
      </div>
    );
  }

  const red = view.questions.filter((q) => !q.correct).length;
  const needTags = view.questions.filter((q) => q.correct && !q.firstCorrect && !q.errorTag).length;

  return (
    <div className="pane-fill flex flex-col">
      {!view.completed && <ActivityTracker activity="IELTS" />}

      <div className="pane-x flex min-h-14 shrink-0 items-center gap-3 border-b border-line bg-bar py-2 md:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{passage.title}</h1>
          <p className="truncate text-sm text-muted">
            {!view.submitted
              ? `${Object.values(answers).filter((a) => a?.trim()).length} of ${numbers.length} answered`
              : view.completed
                ? `Complete · first try ${view.firstCorrect}/${view.total} · estimated band ${view.band}`
                : `First try ${view.firstCorrect}/${view.total} · band ${view.band} · ${red ? `${red} to correct` : `${needTags} to explain`}`}
          </p>
        </div>
        {!view.submitted ? (
          <>
            <Timer seconds={passage.timeLimit * 60} onTick={onTick} onEnd={submit} />
            <Button className="max-md:px-3" onClick={submit} disabled={pending}>
              {pending ? "Checking…" : <>Submit<span className="max-md:hidden"> answers</span></>}
            </Button>
          </>
        ) : view.completed ? (
          <Button variant="secondary" className="max-md:px-3" onClick={again} disabled={pending}>Practise again</Button>
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
              ? `Highlight the sentence that proves your answer to question ${active}.`
              : `Highlight words to make a flashcard${view.submitted && red ? " or to prove a corrected answer" : ""}.`}
          </p>
          <PassageText paragraphs={passage.paragraphs} proofs={proofs} stateOf={stateOf} />

          {selection && (
            <div
              className="absolute z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1 rounded-lg bg-ink p-1 font-sans text-sm text-white shadow-lg"
              style={{ top: selection.top, left: selection.left }}
              onMouseUp={(e) => e.stopPropagation()}
            >
              <button type="button" className="rounded-md px-2.5 py-1 hover:bg-white/15" onClick={() => makeCard(selection.evidence)} disabled={cardPending}>
                Make flashcard
              </button>
              {active !== null && (!view.submitted || (stateOf.get(active) && !stateOf.get(active)!.correct)) && (
                <button type="button" className="rounded-md px-2.5 py-1 hover:bg-white/15" onClick={() => setProofFor(active, selection.evidence)}>
                  Proof for question {active}
                </button>
              )}
            </div>
          )}
        </div>

        <div className={cx("pane-x min-h-0 overflow-y-auto overscroll-contain py-5 md:py-6", tab !== "questions" && "max-md:hidden")}>
          {view.completed && (
            <div className="mb-6 rounded-xl bg-good-soft p-4 text-good">
              <p className="font-semibold">Passage complete</p>
              <p className="mt-1 text-sm">
                First try: {view.firstCorrect} of {view.total} (estimated band {view.band}). Every answer is now correct.{" "}
                <Link href="/student/progress" className="text-good underline">See what caused your mistakes</Link>
              </p>
            </div>
          )}
          {view.submitted && !view.completed && red > 0 && (
            <div className="mb-6 rounded-xl bg-paper p-4 text-sm">
              <p className="font-medium">Correct the red answers</p>
              <p className="mt-1 text-muted">Choose a new answer, then highlight the sentence in the passage that proves it and press Check.</p>
            </div>
          )}

          <div className="space-y-8">
            {groups.map((g, gi) => (
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
                    setAnswers((a) => ({ ...a, [n]: v }));
                    setErrors((e) => (e[n] ? { ...e, [n]: "" } : e));
                  }}
                  onFocus={setActive}
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
                      onRemoveProof={() => setProofs((p) => {
                        const next = { ...p };
                        delete next[n];
                        return next;
                      })}
                      onCheck={() => retry(n)}
                      onTag={(t) => tag(n, t)}
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
                      ? "bg-good text-white"
                      : "bg-good text-white ring-2 ring-[#f0a020] ring-offset-1"
                    : "bg-bad text-white"
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
            {needTags > 0 && <><span className="ml-2 text-[#f0a020]">○</span> say why you missed it</>}
          </span>
        )}
      </nav>

      {toast && <CardToast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/** The exam clock. It keeps its own state, so a tick redraws these few characters and not the passage and questions. */
function Timer({ seconds, onTick, onEnd }: { seconds: number; onTick: (elapsed: number) => void; onEnd: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const begin = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - begin) / 1000);
      onTick(elapsed);
      setLeft(seconds - elapsed);
      if (elapsed >= seconds) {
        clearInterval(timer);
        onEnd();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds, onTick, onEnd]);
  return <span className={cx("font-mono text-lg tabular-nums", left < 120 && "text-bad")} aria-live="off">{mmss(left)}</span>;
}

/** The passage itself. Typing an answer does not touch it, so it is not drawn again for every letter. */
const PassageText = memo(function PassageText({ paragraphs, proofs, stateOf }: { paragraphs: string[]; proofs: Record<number, Evidence>; stateOf: Map<number, QuestionState> }) {
  return (
    <article className="space-y-5 font-serif text-[1.0625rem] leading-relaxed">
      {paragraphs.map((text, i) => (
        <div key={i} className="flex gap-2 md:gap-3">
          <span className="w-4 shrink-0 pt-0.5 font-sans text-sm font-semibold text-muted select-none">{paragraphLetter(i)}</span>
          <p data-para={i} className="min-w-0 flex-1">
            <Marked text={text} marks={Object.entries(proofs).filter(([, e]) => e.paragraph === i).map(([n, e]) => ({ n: Number(n), start: e.start, end: e.end, state: stateOf.get(Number(n)) }))} />
          </p>
        </div>
      ))}
    </article>
  );
});

/** Paragraph text with proof highlights; each mark carries its question number as a CSS badge. */
function Marked({ text, marks }: { text: string; marks: { n: number; start: number; end: number; state?: QuestionState }[] }) {
  if (!marks.length) return <>{text}</>;
  const cuts = [...new Set([0, text.length, ...marks.flatMap((m) => [m.start, m.end])])].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    const covering = marks.filter((m) => m.start <= a && m.end >= b);
    const piece = text.slice(a, b);
    if (!covering.length) out.push(piece);
    else {
      const first = covering.find((m) => m.start === a);
      const st = covering[0].state;
      out.push(
        <mark
          key={i}
          data-n={first ? first.n : undefined}
          className={cx(
            "rounded-sm px-0.5 text-ink",
            st?.correct ? "bg-good-soft" : st && !st.correct ? "bg-[#fde2b8]" : "bg-learning",
            first && "before:mr-1 before:rounded before:bg-ink before:px-1 before:font-sans before:text-[11px] before:text-white before:content-[attr(data-n)]",
          )}
        >
          {piece}
        </mark>,
      );
    }
  }
  return <>{out}</>;
}

const fieldTone = (s: QuestionState | undefined) =>
  !s ? "ring-line" : s.correct ? "bg-good-soft text-good ring-good" : "bg-bad-soft text-bad ring-bad";

function Group({
  group: g,
  paragraphCount,
  answers,
  submitted,
  stateOf,
  onAnswer,
  onFocus,
  renderFooter,
}: {
  group: PublicGroup;
  paragraphCount: number;
  answers: Record<number, string>;
  submitted: boolean;
  stateOf: Map<number, QuestionState>;
  onAnswer: (n: number, v: string) => void;
  onFocus: (n: number) => void;
  renderFooter: (n: number) => ReactNode;
}) {
  const locked = (n: number) => submitted && !!stateOf.get(n)?.correct;
  const tried = (n: number) => new Set((stateOf.get(n)?.wrongAnswers ?? []).map((a) => a.toUpperCase()));

  // Plain render functions, not components: a component defined in here would be a new type on every render,
  // so React would remount the input and the student would lose focus after each letter.
  const renderOptions = (n: number, options: { value: string; label: string }[]) => {
    const s = stateOf.get(n);
    const current = answers[n] ?? "";
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const chosen = current.toUpperCase() === o.value.toUpperCase();
          const wasWrong = tried(n).has(o.value.toUpperCase());
          const isSubmitted = s && s.answer.toUpperCase() === o.value.toUpperCase();
          return (
            <button
              key={o.value}
              type="button"
              disabled={locked(n) || (submitted && wasWrong)}
              onClick={() => {
                onAnswer(n, o.value);
                onFocus(n);
              }}
              className={cx(
                "rounded-md px-3 py-1.5 text-left text-sm ring-1 transition-colors ring-inset",
                isSubmitted && s?.correct
                  ? "bg-good text-white ring-good"
                  : submitted && wasWrong
                    ? "bg-bad-soft text-bad line-through ring-bad"
                    : chosen
                      ? "bg-accent text-white ring-accent"
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

  const renderGap = (n: number) => {
    const s = stateOf.get(n);
    return (
      <input
        value={answers[n] ?? ""}
        disabled={locked(n)}
        onChange={(e) => onAnswer(n, e.target.value)}
        onFocus={() => onFocus(n)}
        autoComplete="off"
        spellCheck={false}
        aria-label={`Answer ${n}`}
        className={cx("mx-1 w-40 max-w-full rounded-md bg-surface px-2 py-0.5 ring-1 focus:outline-none ring-inset focus:ring-2 focus:ring-accent", submitted && fieldTone(s))}
      />
    );
  };

  switch (g.type) {
    case "tfng":
    case "ynng": {
      const opts = (g.type === "tfng" ? ["TRUE", "FALSE", "NOT GIVEN"] : ["YES", "NO", "NOT GIVEN"]).map((v) => ({ value: v, label: v }));
      return (
        <ol className="space-y-4">
          {g.questions.map((q) => (
            <li key={q.number} id={`q${q.number}`} onClick={() => onFocus(q.number)}>
              <p><b>{q.number}</b> {q.statement}</p>
              {renderOptions(q.number, opts)}
              {renderFooter(q.number)}
            </li>
          ))}
        </ol>
      );
    }
    case "mcq":
      return (
        <ol className="space-y-4">
          {g.questions.map((q) => (
            <li key={q.number} id={`q${q.number}`} onClick={() => onFocus(q.number)}>
              <p><b>{q.number}</b> {q.question}</p>
              {renderOptions(q.number, q.options.map((o, i) => ({ value: paragraphLetter(i), label: `${paragraphLetter(i)}  ${o}` })))}
              {renderFooter(q.number)}
            </li>
          ))}
        </ol>
      );
    case "matching":
      return (
        <ol className="space-y-4">
          {g.questions.map((q) => (
            <li key={q.number} id={`q${q.number}`} onClick={() => onFocus(q.number)}>
              <p><b>{q.number}</b> {q.statement}</p>
              {renderOptions(q.number, Array.from({ length: 26 }, (_, i) => paragraphLetter(i)).slice(0, paragraphCount).map((l) => ({ value: l, label: l })))}
              {renderFooter(q.number)}
            </li>
          ))}
        </ol>
      );
    case "headings":
      return (
        <>
          <ol className="mb-4 space-y-0.5 rounded-lg bg-paper py-2 pr-3 pl-4 text-sm">
            {g.headings.map((h, i) => <li key={i}><b className="inline-block w-9">{ROMAN[i]}</b>{h}</li>)}
          </ol>
          <ol className="space-y-4">
            {g.questions.map((q) => (
              <li key={q.number} id={`q${q.number}`} onClick={() => onFocus(q.number)}>
                <p><b>{q.number}</b> Paragraph {q.paragraph}</p>
                {renderOptions(q.number, g.headings.map((_, i) => ({ value: ROMAN[i], label: ROMAN[i] })))}
                {renderFooter(q.number)}
              </li>
            ))}
          </ol>
        </>
      );
    case "completion":
      return (
        <ol className="space-y-4">
          {g.questions.map((q) => {
            const [before, after] = q.text.split("___");
            return (
              <li key={q.number} id={`q${q.number}`}>
                <p className="leading-loose"><b>{q.number}</b> {before}{renderGap(q.number)}{after}</p>
                {renderFooter(q.number)}
              </li>
            );
          })}
        </ol>
      );
    case "notes":
      return (
        <div>
          <NotesText title={g.title} text={g.text} gap={(n) => <span id={`q${n}`}><b className="text-sm">{n}</b>{renderGap(n)}</span>} />
          <div className="mt-2 space-y-3">
            {g.questions.map((q) => (
              <div key={q.number} onClick={() => onFocus(q.number)}>
                {stateOf.has(q.number) && <p className="text-sm font-semibold">Question {q.number}</p>}
                {renderFooter(q.number)}
              </div>
            ))}
          </div>
        </div>
      );
    case "summary":
      return (
        <div>
          <div className="rounded-lg bg-paper p-4 leading-loose">
            {g.title && <p className="mb-1 font-semibold">{g.title}</p>}
            {g.text.split(/(\{\{\d+\}\})/).map((part, i) => {
              const m = part.match(/^\{\{(\d+)\}\}$/);
              if (!m) return <span key={i}>{part}</span>;
              const n = Number(m[1]);
              return <span key={i} id={`q${n}`}><b className="text-sm">({n})</b>{renderGap(n)}</span>;
            })}
          </div>
          <div className="mt-2 space-y-3">
            {g.questions.map((q) => (
              <div key={q.number} onClick={() => onFocus(q.number)}>
                {(submitted || stateOf.has(q.number)) && <p className="text-sm font-semibold">Gap ({q.number})</p>}
                {renderFooter(q.number)}
              </div>
            ))}
          </div>
        </div>
      );
  }
}

function QuestionFooter({
  n,
  submitted,
  state,
  proof,
  active,
  error,
  pending,
  onActivate,
  onRemoveProof,
  onCheck,
  onTag,
}: {
  n: number;
  submitted: boolean;
  state?: QuestionState;
  proof?: Evidence;
  active: boolean;
  error?: string;
  pending: boolean;
  onActivate: () => void;
  onRemoveProof: () => void;
  onCheck: () => void;
  onTag: (t: Tag) => void;
}) {
  const proofLine = proof && (
    <p className="mt-2 rounded-md bg-learning/60 px-2 py-1 text-sm">
      <span className="text-muted">Proof (paragraph {paragraphLetter(proof.paragraph)}):</span> <span className="font-serif italic">“{proof.text}”</span>
      {(!submitted || (state && !state.correct)) && (
        <button type="button" className="ml-2 text-muted hover:text-ink" onClick={onRemoveProof} aria-label="Remove proof">✕</button>
      )}
    </p>
  );

  if (!submitted) return proofLine || null;
  if (!state) return null;

  if (state.correct) {
    const needsTag = !state.firstCorrect && !state.errorTag;
    return (
      <div className="mt-2 text-sm">
        <p className="font-medium text-good">✓ Correct{!state.firstCorrect && ` on try ${state.tries}`}</p>
        {state.explanation && <p className="mt-0.5 text-muted">{state.explanation}</p>}
        {proofLine}
        {needsTag && (
          <div className="mt-3 rounded-lg bg-paper p-3">
            <p className="font-medium">Why did you miss this the first time?</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {TAGS.map((t) => (
                <button key={t.tag} type="button" disabled={pending} onClick={() => onTag(t.tag)} className="rounded-md bg-surface px-3 py-2 text-left ring-1 ring-line hover:bg-hover ring-inset">
                  <span className="block font-medium">{t.title}</span>
                  <span className="block text-xs text-muted">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {state.errorTag && <p className="mt-1 text-xs text-muted">Reason: {TAGS.find((t) => t.tag === state.errorTag)?.title}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 text-sm">
      <p className="font-medium text-bad">✗ Not correct{state.tries > 1 && ` · ${state.tries} tries`}. Find the answer in the passage.</p>
      {proofLine}
      {!proof && !error && (
        <p className={cx("mt-1", active ? "text-accent" : "text-muted")}>
          {active ? (
            <>
              Now highlight the sentence that proves your new answer.{" "}
              {/* On a phone the passage is behind the other tab. */}
              <button type="button" className="font-medium underline md:hidden" onClick={onActivate}>Open the passage</button>
            </>
          ) : (
            <button type="button" className="text-accent hover:underline" onClick={onActivate}>Prove a new answer</button>
          )}
        </p>
      )}
      {error && <p className="mt-1 text-bad">{error}</p>}
      <Button className="mt-2 px-3 py-1.5 text-sm" disabled={pending} onClick={onCheck}>
        Check question {n}
      </Button>
    </div>
  );
}

function CardToast({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [undone, setUndone] = useState(false);
  useEffect(() => {
    const t = setTimeout(onClose, 9000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div role="status" className="fixed inset-x-4 bottom-16 z-30 rounded-xl bg-ink p-4 text-sm text-white shadow-lg md:left-auto md:right-6 md:w-80">
      {"error" in toast ? (
        <p>{toast.error}</p>
      ) : undone ? (
        <p>Card removed.</p>
      ) : (
        <>
          <p className="font-medium">Flashcard added to “My IELTS chunks”</p>
          <p className="mt-1">
            <b>{toast.chunk}</b>
            {toast.meaning ? ` — ${toast.meaning}` : toast.pending && <span className="text-white/60"> — finding a simple meaning…</span>}
          </p>
          {toast.uz && <p className="text-white/70">O‘zbekcha: {toast.uz}</p>}
          <button
            type="button"
            className="mt-2 text-[#8cc4ff] hover:underline"
            onClick={() => {
              deleteOwnCard(toast.id);
              setUndone(true);
            }}
          >
            Undo
          </button>
        </>
      )}
    </div>
  );
}
