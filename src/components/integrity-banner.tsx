import { isAutoFinish, type SubmissionReason } from "@/lib/telemetry";

const WHY: Partial<Record<SubmissionReason, string>> = {
  TAB_HIDDEN: "you left the test tab",
  WINDOW_BLUR: "you switched to another window",
  FULLSCREEN_EXIT: "you exited fullscreen",
};

/** After a first try the proctor finished for the student: why, the score it got, and what is left to do. */
export function IntegrityBanner({ reason, firstCorrect, total, band }: { kind: "reading" | "listening"; reason: SubmissionReason; firstCorrect: number | null; total: number; band: number | null }) {
  if (!isAutoFinish(reason)) return null;
  return (
    <div role="status" className="mb-6 rounded-xl bg-warn-soft p-4 text-sm text-ink">
      <p className="font-semibold">Your first try was submitted automatically</p>
      <p className="mt-1">
        Because {WHY[reason]}. Score {firstCorrect ?? 0}/{total}
        {band !== null && ` (band ${band})`}. Now correct the red answers.
      </p>
    </div>
  );
}
