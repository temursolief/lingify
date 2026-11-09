"use client";

import { useState, useTransition, type FormEvent } from "react";
import { submitReview, type ReviewResult } from "@/app/actions/review";
import { ActivityTracker } from "@/components/activity-tracker";
import { Button, ButtonLink, Card, ProgressBar, cx } from "@/components/ui";
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
    <Card>
      <ActivityTracker activity="REVIEW" />
      <div className="mb-5 flex items-center gap-3 text-sm text-muted">
        <span className="whitespace-nowrap tabular-nums">{index + 1} / {cards.length}</span>
        <ProgressBar value={index / cards.length} label="Review progress" />
      </div>

      {card.gapped ? (
        <p className="font-serif text-xl leading-relaxed">
          {before}
          <span className={cx("mx-1 inline-block min-w-24 border-b-2 px-1 text-center", result ? (result.correct ? "border-good text-good" : "border-bad text-bad") : "border-accent")}>
            {result ? result.expected : `${card.firstLetter}${"·".repeat(Math.max(0, card.length - 1))}`}
          </span>
          {after}
        </p>
      ) : (
        <p className="text-lg">Which word means: <strong>{card.hint ?? card.lemma}</strong>?</p>
      )}

      {card.hint && card.gapped && (
        <div className="mt-3 text-sm">
          {showHint || result ? (
            <p className="text-muted">Meaning: {card.hint}</p>
          ) : (
            <button type="button" className="text-accent underline" onClick={() => setShowHint(true)}>Show meaning</button>
          )}
        </div>
      )}

      {mode === "choice" && card.options ? (
        <div className="mt-5 grid grid-cols-2 gap-2">
          {card.options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={!!result || pending}
              onClick={() => answer(option)}
              className={cx(
                "rounded-lg border px-4 py-3 font-medium transition",
                result && option === result.expected.toLowerCase()
                  ? "border-good bg-good-soft text-good"
                  : result && option === chosen
                    ? "border-bad bg-bad-soft text-bad"
                    : "border-line hover:border-muted",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-5 flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={!!result || pending}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Type the missing word"
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-lg focus:border-accent focus:outline-none"
          />
          <Button type="submit" disabled={!!result || pending || !typed.trim()}>Check</Button>
        </form>
      )}

      {result && (
        <div className="mt-5" aria-live="polite">
          <p className={cx("font-medium", result.correct ? "text-good" : "text-bad")}>
            {result.graduated
              ? "Correct! You know this word now. 🎉"
              : result.correct
                ? `Correct! See you again in ${result.nextInDays} day${result.nextInDays === 1 ? "" : "s"}.`
                : `The answer is “${result.expected}”. It will come back in a few minutes.`}
          </p>
          {!result.graduated && (
            <p className="mt-1 text-xs text-muted">
              {result.correct ? Math.min(card.streak + 1, GRADUATE_STREAK) : 0} of {GRADUATE_STREAK} correct reviews in a row to learn it · seen in {card.exposures} text{card.exposures === 1 ? "" : "s"}
            </p>
          )}
          <Button className="mt-4" onClick={next} autoFocus>Next</Button>
        </div>
      )}
    </Card>
  );
}
