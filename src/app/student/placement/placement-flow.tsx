"use client";

import { useState, useTransition } from "react";
import { saveTopics, startPlacement, submitPlacementStage, type PlacementOutcome } from "@/app/actions/placement";
import { ActivityTracker } from "@/components/activity-tracker";
import { Button, ButtonLink, Card, cx } from "@/components/ui";
import { TOPICS, topicLabel } from "@/lib/topics";

type Step =
  | { kind: "topics" }
  | { kind: "intro" }
  | { kind: "test"; testId: string; words: string[]; stage: 1 | 2 }
  | { kind: "result"; outcome: Extract<PlacementOutcome, { done: true }> };

export function PlacementFlow({ name, initialTopics, retake }: { name: string; initialTopics: string[]; retake: boolean }) {
  const [step, setStep] = useState<Step>({ kind: "topics" });
  const [topics, setTopics] = useState<string[]>(initialTopics);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });

  if (step.kind === "topics") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">{retake ? "Retake your placement" : `Welcome, ${name.split(" ")[0]}!`}</h1>
        <p className="mt-2 text-muted">First, what do you like reading about? We use this to suggest texts. Choose as many as you like.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {TOPICS.map((t) => {
            const on = topics.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setTopics(on ? topics.filter((x) => x !== t) : [...topics, t])}
                className={cx(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:text-ink",
                )}
              >
                {topicLabel(t)}
              </button>
            );
          })}
        </div>
        <Button className="mt-8" disabled={pending} onClick={() => run(async () => { await saveTopics(topics); setStep({ kind: "intro" }); })}>
          Continue
        </Button>
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      </div>
    );
  }

  if (step.kind === "intro") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">How many words do you know?</h1>
        <div className="mt-4 space-y-3 text-muted">
          <p>You will see a list of English words. <strong className="text-ink">Tap every word you know the meaning of.</strong></p>
          <p>Some words are not real English words. Do not tap those. Guessing makes your result less accurate, and then the texts we choose for you will be too hard.</p>
          <p>It takes about 5 minutes. There are no right or wrong answers here, just be honest.</p>
        </div>
        <Button
          className="mt-8"
          disabled={pending}
          onClick={() => run(async () => {
            const { testId, words } = await startPlacement();
            setChecked(new Set());
            setStep({ kind: "test", testId, words, stage: 1 });
          })}
        >
          {pending ? "Preparing…" : "Start"}
        </Button>
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      </div>
    );
  }

  if (step.kind === "test") {
    const toggle = (w: string) => {
      const next = new Set(checked);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      setChecked(next);
    };
    return (
      <div className="mx-auto max-w-3xl">
        <ActivityTracker activity="PLACEMENT" />
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-accent">Part {step.stage} {step.stage === 1 ? "" : "· a few harder words"}</p>
            <h1 className="text-xl font-semibold">Tap the words you know</h1>
          </div>
          <p className="text-sm text-muted tabular-nums">{checked.size} selected</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {step.words.map((w) => {
            const on = checked.has(w);
            return (
              <button
                key={w}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(w)}
                className={cx(
                  "rounded-lg border px-3 py-2.5 text-left font-medium transition",
                  on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:border-muted",
                )}
              >
                <span className="mr-2 inline-block w-4 text-center" aria-hidden>{on ? "✓" : ""}</span>
                {w}
              </button>
            );
          })}
        </div>
        <Button
          className="mt-6"
          disabled={pending}
          onClick={() => run(async () => {
            const outcome = await submitPlacementStage(step.testId, [...checked]);
            setChecked(new Set());
            if (outcome.done) setStep({ kind: "result", outcome });
            else setStep({ kind: "test", testId: step.testId, words: outcome.words, stage: 2 });
          })}
        >
          {pending ? "Checking…" : step.stage === 1 ? "Next" : "Finish"}
        </Button>
        {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      </div>
    );
  }

  const { estimate, unlocked, total, falseAlarmRate } = step.outcome;
  return (
    <div className="mx-auto max-w-xl">
      <Card className="text-center">
        <p className="text-sm font-medium text-accent">Your starting point</p>
        <p className="mt-2 text-5xl font-semibold tabular-nums">{estimate.toLocaleString()}</p>
        <p className="mt-1 text-muted">English words you already know (estimated)</p>
        <p className="mt-6">
          You can read <strong>{unlocked}</strong> of our {total} texts right now. Every word you learn opens up more.
        </p>
        {falseAlarmRate > 0.25 && (
          <p className="mt-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">
            You selected several words that are not real English. Your estimate may be too high. You can retake the test from your Progress page.
          </p>
        )}
        <ButtonLink href="/student" className="mt-8">Go to my dashboard</ButtonLink>
      </Card>
    </div>
  );
}
