"use client";

import { useState, useTransition, type FormEvent } from "react";
import { submitReview, type ReviewResult } from "@/app/actions/review";
import { ActivityTracker } from "@/components/activity-tracker";
import { Button, ButtonLink, Card, cx } from "@/components/ui";
import { GRADUATE_STREAK } from "@/lib/srs";
import type { ReviewCard } from "@/lib/review-queue";

export function ReviewSession({ cards, mode }: { cards: ReviewCard[]; mode: "typed" | "choice" }) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [tally, setTally] = useState({ correct: 0, graduated: 0 });
  const [pending, start] = useTransition();
  const [showHint, setShowHint] = useState(false);

  if (index >= cards.length) {
    return (
      <Card className="text-center">
        <h2 className="text-xl font-semibold">Review complete</h2>
        <p className="mt-2 text-muted">
          {tally.correct} of {cards.length} correct
          {tally.graduated > 0 && ` · ${tally.graduated} word${tally.graduated === 1 ? "" : "s"} moved to “known”`}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/student/library">Keep reading</ButtonLink>
          <ButtonLink href="/student/words" variant="secondary">My words</ButtonLink>
        </div>
      </Card>
    );
  }

  const card = cards[index];
  const answer = (value: string) =>
    start(async () => {
      setChosen(value);
      const r = await submitReview({ lemma: card.lemma, answer: value });
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
    <div className="text-center">
      <ActivityTracker activity="REVIEW" />
      <p className="mb-6 tabular-nums" aria-label={`${cards.length - index} words left`}>
        <span className="text-good underline decoration-2 underline-offset-4">{cards.length - index}</span>
        <span className="ml-3 text-muted">left</span>
      </p>

      {card.gapped ? (
        <p className="text-2xl leading-relaxed">
          {before}
          <span className={cx("mx-1 inline-block min-w-24 border-b-2 px-1 text-center", result ? (result.correct ? "border-good text-good" : "border-warn text-warn") : "border-accent")}>
            {result ? result.expected : `${card.firstLetter}${"·".repeat(Math.max(0, card.length - 1))}`}
          </span>
          {after}
        </p>
      ) : (
        <p className="text-2xl">Which word means: <strong>{card.hint ?? card.lemma}</strong>?</p>
      )}

      {card.hint && card.gapped && (
        <div className="mt-4">
          {showHint || result ? (
            <p className="text-muted">Meaning: {card.hint}</p>
          ) : (
            <button type="button" className="text-accent underline" onClick={() => setShowHint(true)}>Show meaning</button>
          )}
        </div>
      )}

      {mode === "choice" && card.options ? (
        <div className="mx-auto mt-6 grid max-w-lg grid-cols-2 gap-2 border-t border-line pt-6">
          {card.options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={!!result || pending}
              onClick={() => answer(option)}
              className={cx(
                "rounded-md border px-3 py-2 transition-colors",
                result && option === result.expected.toLowerCase()
                  ? "border-good bg-good-soft text-good"
                  : result && option === chosen
                    ? "border-warn bg-warn-soft text-warn"
                    : "border-line hover:bg-paper",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mx-auto mt-6 flex max-w-md gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={!!result || pending}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Type the missing word"
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-lg focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-accent/25"
          />
          <Button type="submit" disabled={!!result || pending || !typed.trim()}>Check</Button>
        </form>
      )}

      {result && (
        <div className="mt-6" aria-live="polite">
          <p className={cx("font-medium", result.correct ? "text-good" : "text-warn")}>
            {result.graduated
              ? "Correct! You know this word now. 🎉"
              : result.correct
                ? `Correct! See you again in ${result.nextInDays} day${result.nextInDays === 1 ? "" : "s"}.`
                : `Good try. The answer is “${result.expected}”. It will come back in a few minutes.`}
          </p>
          {!result.graduated && (
            <p className="mt-1 text-xs text-muted">
              {result.correct ? Math.min(card.streak + 1, GRADUATE_STREAK) : 0} of {GRADUATE_STREAK} correct reviews in a row to learn it · seen in {card.exposures} text{card.exposures === 1 ? "" : "s"}
            </p>
          )}
          <Button className="mt-4" onClick={next} autoFocus>Next</Button>
        </div>
      )}
    </div>
  );
}
