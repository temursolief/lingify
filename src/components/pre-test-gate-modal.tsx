"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import type { ProctoringPolicy } from "@/lib/telemetry";
import { useFullscreenSupported } from "@/lib/use-test-proctor";

/**
 * Shown before a first try: what the test is and how it is locked. The questions are not sent to the browser until
 * the student presses Start, and the button is the gesture fullscreen needs.
 */
export function PreTestGateModal({
  kind,
  title,
  policy,
  points,
  startLabel,
  resuming,
  pending,
  onStart,
}: {
  kind: "reading" | "listening";
  title: string;
  policy: ProctoringPolicy;
  /** what this test is: questions, time, how corrections work */
  points: ReactNode[];
  startLabel: string;
  /** a practice test opened again after a reload: the clock kept running */
  resuming?: boolean;
  pending?: boolean;
  onStart: () => void;
}) {
  const fullscreen = useFullscreenSupported() && policy !== "NONE";
  const leave = fullscreen ? "Leaving the tab, switching apps or exiting fullscreen" : "Leaving the tab or switching apps";
  return (
    <div className="mx-auto max-w-xl md:pt-6">
      <div className="rounded-xl bg-surface p-5 shadow-bubble md:p-6" role="dialog" aria-labelledby="test-gate-title">
        <p className="text-sm text-muted">{kind === "reading" ? "IELTS Academic Reading" : "IELTS Listening"}</p>
        <h1 id="test-gate-title" className="mt-1 text-xl font-semibold">{title}</h1>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[15px]">
          {points.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
        {policy === "NONE" ? (
          <p className="mt-4 rounded-lg bg-paper p-3 text-sm text-muted">Practice mode: leaving is shown to your teacher.</p>
        ) : (
          <div className="mt-4 rounded-lg bg-warn-soft p-3 text-sm text-ink">
            <p className="font-semibold">{fullscreen ? "This test runs in Fullscreen Lock mode." : "This test is locked to this screen."}</p>
            <p className="mt-1">
              {policy === "STRICT"
                ? `${leave} will immediately finish and submit your test.`
                : `${leave}: one warning (5 seconds), then it submits.`}{" "}
              Copy, paste{kind === "reading" ? " and Find" : ""} are off.
            </p>
          </div>
        )}
        <Button className="mt-6 w-full" onClick={onStart} disabled={pending}>
          {pending ? "Starting…" : resuming ? "Resume test" : fullscreen ? `Enter fullscreen & start · ${startLabel}` : `Start test · ${startLabel}`}
        </Button>
      </div>
    </div>
  );
}
