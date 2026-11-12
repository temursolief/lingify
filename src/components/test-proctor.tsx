"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import type { ProctorWarning } from "@/lib/use-test-proctor";

const WHAT: Record<ProctorWarning["reason"], string> = {
  TAB_HIDDEN: "You left the test tab.",
  WINDOW_BLUR: "You switched to another window.",
  FULLSCREEN_EXIT: "You exited fullscreen.",
};

/** WARN_ONCE: the one warning. It covers the test until the student returns, and counts down to submission. */
export function ProctorWarningOverlay({ warning, fullscreen, onResume }: { warning: ProctorWarning; fullscreen: boolean; onResume: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((warning.deadline - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((warning.deadline - Date.now()) / 1000))), 200);
    return () => clearInterval(t);
  }, [warning.deadline]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" role="alertdialog" aria-modal="true" aria-labelledby="proctor-warning">
      <div className="w-full max-w-sm rounded-xl bg-surface p-6 text-center shadow-lg">
        <p id="proctor-warning" className="text-lg font-semibold text-bad">{WHAT[warning.reason]}</p>
        <p className="mt-2 text-[15px]">This is your only warning. Next time, your test is submitted.</p>
        <p className="mt-4 font-mono text-4xl tabular-nums text-bad" aria-live="assertive">{left}</p>
        <Button className="mt-4 w-full" onClick={onResume}>{fullscreen ? "Return to fullscreen" : "Return to the test"}</Button>
      </div>
    </div>
  );
}

/** While a first try is being sent after the test ended (slowly, or again after a lost connection). */
export function SubmittingOverlay({ failed }: { failed: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="status">
      <div className="w-full max-w-sm rounded-xl bg-surface p-6 text-center shadow-lg">
        <p className="font-semibold">Submitting your answers…</p>
        {failed && <p className="mt-2 text-sm text-muted">No connection right now. Your answers are saved on this device and sent as soon as it is back.</p>}
      </div>
    </div>
  );
}
