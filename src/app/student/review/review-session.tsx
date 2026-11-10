"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { submitReview } from "@/app/actions/review";
import { ActivityTracker } from "@/components/activity-tracker";
import { Button, ButtonLink, Card, cx } from "@/components/ui";
import type { ReviewResult } from "@/lib/review-grade";
import { GRADUATE_STREAK } from "@/lib/srs";
import type { ReviewCard } from "@/lib/review-queue";

type Submit = (input: { lemma: string; answer: string }) => Promise<ReviewResult>;

/**
 * One card at a time in a single white bubble. `submit` is the server action online; the offline app passes
 * a function that grades on the laptop and queues the answer for syncing.
 */
export function ReviewSession({
  cards,
  mode,
  submit = submitReview,
  track = true,
  doneActions,
}: {
  cards: ReviewCard[];
  mode: "typed" | "choice";
  submit?: Submit;
  track?: boolean;
  doneActions?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [tally, setTally] = useState({ correct: 0, graduated: 0 });
  const [pending, start] = useTransition();
  const [showHint, setShowHint] = useState(false);

  if (index >= cards.length) {
    return (
      <Card className="mx-auto max-w-xl py-8 text-center">
        <h2 className="text-lg font-semibold">Review complete</h2>
        <p className="mt-1 text-muted">
          {tally.correct} of {cards.length} correct
          {tally.graduated > 0 && ` · ${tally.graduated} word${tally.graduated === 1 ? "" : "s"} learned`}
        </p>
        <div className="mt-5 flex justify-center gap-2">{doneActions ?? <ButtonLink href="/student/library">Keep reading</ButtonLink>}</div>
      </Card>
    );
  }

  const card = cards[index];
  const answer = (value: string) =>
    start(async () => {
      setChosen(value);
      const r = await submit({ lemma: card.lemma, answer: value });
      setResult(r);
      setTally((t) => ({ correct: t.correct + (r.correct ? 1 : 0), graduated: t.graduated + (r.graduated ? 1 : 0) }));
    });
  const next = () => {
    setIndex(index + 1);
    setTyped("");
    setResult(null);
    setChosen(null);
    setShowHint(false);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim()) answer(typed);
  };
  const [before, after] = card.gapped ? card.gapped.split("_____") : [null, null];

  return (
    <div className="mx-auto max-w-xl">
      {track && <ActivityTracker activity="REVIEW" />}
      <div className="mb-3 flex items-center gap-3 text-sm text-muted">
        <div className="flex-1">
          <div className="h-1 overflow-hidden rounded-full bg-grid">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(index / cards.length) * 100}%` }} />
          </div>
        </div>
        <span className="tabular-nums">{index + 1} / {cards.length}</span>
      </div>

      <Card className="px-6 py-8 text-center">
        {card.checkup && <p className="mb-3 text-sm text-muted">Check-up: do you still know this {card.isPhrase ? "phrase" : "word"}?</p>}
        {card.gapped ? (
          <p className="font-serif text-2xl leading-relaxed">
            {before}
            <span className={cx("mx-1 inline-block min-w-24 border-b-2 px-1 text-center", result ? (result.correct ? "border-good text-good" : "border-warn text-warn") : "border-accent")}>
              {result ? result.expected : `${card.firstLetter}${"·".repeat(Math.max(0, card.length - 1))}`}
            </span>
            {after}
          </p>
        ) : (
          <p className="text-xl">Which word means: <strong>{card.hint ?? card.lemma}</strong>?</p>
        )}

        {card.hint && card.gapped && (
          <div className="mt-4 text-sm">
            {showHint || result ? (
              <p className="text-muted">Meaning: {card.hint}</p>
            ) : (
              <button type="button" className="text-accent hover:underline" onClick={() => setShowHint(true)}>Show meaning</button>
            )}
          </div>
        )}

        {mode === "choice" && card.options ? (
          <div className="mt-6 grid grid-cols-2 gap-2">
            {card.options.map((option) => (
              <button
                key={option}
                type="button"
                disabled={!!result || pending}
                onClick={() => answer(option)}
                className={cx(
                  "rounded-md px-3 py-2.5 transition-colors",
                  result && option === result.expected.toLowerCase()
                    ? "bg-good-soft text-good"
                    : result && option === chosen
                      ? "bg-warn-soft text-warn"
                      : "bg-paper hover:bg-grid",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={!!result || pending}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Type the missing word"
              aria-label="Type the missing word"
              className="flex-1 rounded-md border border-line bg-surface px-3 py-2 text-lg focus:border-accent focus:outline-none"
            />
            <Button type="submit" disabled={!!result || pending || !typed.trim()}>Check</Button>
          </form>
        )}

        {result && (
          <div className="mt-6" aria-live="polite">
            <p className={cx("font-medium", result.correct ? "text-good" : "text-warn")}>
              {result.graduated
                ? "Correct! You know this word now. It will come back for a check-up in a month."
                : result.forgotten
                  ? `The answer is “${result.expected}”. It's back in your learning words for now.`
                  : result.correct
                    ? `Correct! See you again in ${result.nextInDays} day${result.nextInDays === 1 ? "" : "s"}.`
                    : `The answer is “${result.expected}”. It will come back in a few minutes.`}
            </p>
            {!result.graduated && !card.checkup && (
              <p className="mt-1 text-xs text-muted">
                {result.correct ? Math.min(card.streak + 1, GRADUATE_STREAK) : 0} of {GRADUATE_STREAK} correct in a row to learn it
              </p>
            )}
            <Button className="mt-4 min-w-32" onClick={next} autoFocus>Next</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
