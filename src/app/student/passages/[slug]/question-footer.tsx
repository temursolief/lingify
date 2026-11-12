"use client";

import { Button, cx } from "@/components/ui";
import { paragraphLetter } from "@/lib/passage-format";
import type { Evidence, QuestionState } from "@/lib/passages";

export type Tag = "VOCAB" | "DISTRACTOR" | "LOGIC" | "CARELESS";

export const TAGS: { tag: Tag; title: string; hint: string }[] = [
  { tag: "VOCAB", title: "Vocab / Synonym", hint: "Didn't know a word or missed the paraphrase" },
  { tag: "DISTRACTOR", title: "Trap / Distractor", hint: "Fell for a word-match trick" },
  { tag: "LOGIC", title: "Logic / NG vs False", hint: "Over-inferred or misread the logic" },
  { tag: "CARELESS", title: "Speed / Careless", hint: "Skimmed too fast or misread" },
];

/** Under each question: its proof, and after the first try its result, the Check button or the "why" tags. */
export function QuestionFooter({
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

