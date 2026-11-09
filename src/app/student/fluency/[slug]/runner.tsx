"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveFluencyRun } from "@/app/actions/fluency";
import { ActivityTracker } from "@/components/activity-tracker";
import { Button, ButtonLink, Card, cx } from "@/components/ui";

type Result = Awaited<ReturnType<typeof saveFluencyRun>>;

export function FluencyRunner({ text, paragraphs, gist, target }: {
  text: { id: string; title: string; wordCount: number };
  paragraphs: string[];
  gist: { question: string; options: string[] } | null;
  target: number;
}) {
  const [phase, setPhase] = useState<"ready" | "reading" | "check" | "result">("ready");
  const [elapsed, setElapsed] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedMs = useRef(0);
  const targetSeconds = Math.round((text.wordCount / target) * 60);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const begin = () => {
    const now = Date.now();
    elapsedMs.current = 0;
    setPhase("reading");
    timer.current = setInterval(() => {
      elapsedMs.current = Date.now() - now;
      setElapsed(Math.floor(elapsedMs.current / 1000));
    }, 250);
  };
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    const s = Math.max(5, Math.round(elapsedMs.current / 1000));
    setSeconds(s);
    setPhase(gist ? "check" : "result");
    if (!gist) submit(s, 0);
  };
  const submit = (s: number, choice: number) =>
    start(async () => {
      setResult(await saveFluencyRun({ textId: text.id, seconds: s, gistChoice: choice }));
      setPhase("result");
    });
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl">
      {(phase === "reading" || phase === "check") && <ActivityTracker activity="FLUENCY" />}
      <p className="text-sm text-muted">Speed reading</p>
      <h1 className="font-serif text-3xl font-semibold">{text.title}</h1>

      {phase === "ready" && (
        <Card className="mt-6">
          <p className="text-lg">Your target: <strong>{target} words per minute</strong>, about {mmss(targetSeconds)} for {text.wordCount} words.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
            <li>Read a little faster than feels comfortable, but make sure you follow the story.</li>
            <li>Don&apos;t stop for words you don&apos;t know, and don&apos;t go back.</li>
            <li>Press “Finished” as soon as you reach the end. Then answer one question.</li>
          </ul>
          <Button className="mt-5" onClick={begin}>Start the timer</Button>
        </Card>
      )}

      {phase === "reading" && (
        <>
          <div className="sticky top-16 z-10 mt-4 flex items-center justify-between rounded-xl border border-line bg-surface/95 px-4 py-2 backdrop-blur">
            <span className={cx("font-mono text-xl tabular-nums", elapsed > targetSeconds && "text-warn")}>{mmss(elapsed)}</span>
            <span className="text-sm text-muted">target {mmss(targetSeconds)}</span>
            <Button onClick={stop}>Finished</Button>
          </div>
          <div className="mt-6 space-y-5 font-serif text-xl leading-relaxed">
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <div className="mt-8 flex justify-center"><Button onClick={stop} className="px-6 py-3">Finished</Button></div>
        </>
      )}

      {phase === "check" && gist && (
        <Card className="mt-6">
          <p className="text-sm text-muted">Time: {mmss(seconds)}. One quick check:</p>
          <p className="mt-2 text-lg font-medium">{gist.question}</p>
          <div className="mt-3 space-y-2">
            {gist.options.map((o, i) => (
              <button key={i} type="button" disabled={pending} onClick={() => submit(seconds, i)} className="block w-full rounded-lg border border-line px-4 py-3 text-left hover:bg-paper">
                {o}
              </button>
            ))}
          </div>
        </Card>
      )}

      {phase === "result" && result && (
        <Card className="mt-6 text-center">
          <p className="text-sm text-muted">Your speed</p>
          <p className="text-5xl font-semibold tabular-nums">{result.wpm}</p>
          <p className="text-muted">words per minute</p>
          {result.tooFast ? (
            <p className="mt-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">That was faster than people can really read. Try again and read every line.</p>
          ) : result.gistCorrect === false ? (
            <p className="mt-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">
              Good try, but the main idea was “{result.gistAnswer}”. Slow down a little so you still understand. This run won&apos;t count as a best.
            </p>
          ) : result.newBest ? (
            <p className="mt-4 rounded-lg bg-good-soft p-3 text-sm text-good">New personal best! 🎉{result.previousBest ? ` Up from ${result.previousBest} wpm.` : ""}</p>
          ) : (
            <p className="mt-4 text-sm text-muted">Your best is {result.previousBest} wpm. Speed grows slowly with practice. Easy texts, often.</p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <ButtonLink href="/student/fluency">Another text</ButtonLink>
            <Button variant="secondary" onClick={() => { setResult(null); setElapsed(0); setPhase("ready"); }}>Try this one again</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
