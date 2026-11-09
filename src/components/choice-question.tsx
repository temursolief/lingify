"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button, cx } from "./ui";

export type Feedback = { correct: boolean; answer: number; explanation?: string };

const PRAISE = ["Correct!", "Well done!", "Exactly right!", "Nice work!"];

/** Gentle wording: a wrong answer is part of learning, so it is shown in amber with the right answer, never in red. */
export function feedbackLine(correct: boolean, seed = 0) {
  return correct ? PRAISE[seed % PRAISE.length] : "Good try. Here is the answer.";
}

export function ChoiceQuestion({
  question,
  options,
  check,
  onAnswered,
  onNext,
  nextLabel = "Continue",
  header,
  seed = 0,
  compact = false,
}: {
  question: ReactNode;
  options: string[];
  check: (choice: number) => Promise<Feedback>;
  onAnswered?: (correct: boolean) => void;
  onNext?: () => void;
  nextLabel?: string;
  header?: ReactNode;
  seed?: number;
  compact?: boolean;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const pick = (i: number) =>
    start(async () => {
      setChosen(i);
      setFailed(false);
      try {
        const f = await check(i);
        setFeedback(f);
        onAnswered?.(f.correct);
      } catch {
        setChosen(null);
        setFailed(true);
      }
    });

  return (
    <div>
      {header}
      <div className={cx("font-medium", compact ? "text-base" : "text-lg")}>{question}</div>
      <div className={cx("mt-3 gap-2", options.length <= 2 ? "grid grid-cols-2" : "space-y-2")}>
        {options.map((option, i) => {
          const isAnswer = feedback && i === feedback.answer;
          const isWrongPick = feedback && i === chosen && !feedback.correct;
          return (
            <button
              key={i}
              type="button"
              disabled={!!feedback || pending}
              onClick={() => pick(i)}
              className={cx(
                "block w-full rounded-lg border px-4 text-left transition",
                compact ? "py-2" : "py-3",
                isAnswer ? "border-good bg-good-soft text-good" : isWrongPick ? "border-warn bg-warn-soft text-warn" : "border-line hover:bg-paper",
                pending && chosen === i && "opacity-60",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
      {failed && <p className="mt-2 text-sm text-warn">That didn&apos;t save. Please try again.</p>}
      {feedback && (
        <div className="mt-3" aria-live="polite">
          <p className={cx("font-medium", feedback.correct ? "text-good" : "text-warn")}>{feedbackLine(feedback.correct, seed)}</p>
          {feedback.explanation && <p className="mt-1 text-muted">{feedback.explanation}</p>}
          {onNext && (
            <Button className="mt-3" onClick={onNext} autoFocus>
              {nextLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
