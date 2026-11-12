"use client";

import type { ReactNode } from "react";
import { NotesText } from "@/components/notes-text";
import { cx } from "@/components/ui";
import { paragraphLetter, ROMAN, type PublicGroup } from "@/lib/passage-format";
import type { QuestionState } from "@/lib/passages";

const fieldTone = (s: QuestionState | undefined) =>
  !s ? "ring-line" : s.correct ? "bg-good-soft text-good ring-good" : "bg-bad-soft text-bad ring-bad";

/** One group of questions, in the layout of its IELTS type. */
export function Group({
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

