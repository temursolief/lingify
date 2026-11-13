"use client";

import { useState, useTransition } from "react";
import { nudgeStudent, resetAttemptForRetake, setLeague } from "@/app/actions/teacher";
import { accentOutline, cx } from "@/components/ui";

/** A Telegram nudge; disabled (with the reason on hover) when the student has not linked Telegram. */
export function NudgeButton({ studentId, name, linked, label = "Nudge" }: { studentId: string; name: string; linked: boolean; label?: string }) {
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  if (message) return <span className={cx("text-xs", message.ok ? "text-good" : "text-bad")}>{message.ok ?? message.error}</span>;
  return (
    <button
      type="button"
      className={accentOutline}
      disabled={!linked || pending}
      title={linked ? `Send ${name} a Telegram nudge` : `${name} has not linked Telegram`}
      onClick={() => start(async () => setMessage(await nudgeStudent(studentId)))}
    >
      {pending ? "Sending…" : label}
    </button>
  );
}

/** "Require retake" with a confirm step, sized like the other one-click fixes on Today. */
export function RetakeNowButton({ kind, attemptId, name }: { kind: "passage" | "lesson"; attemptId: string; name: string }) {
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (message) return <span className="text-xs text-muted">{message}</span>;
  if (!asking)
    return (
      <button type="button" className={accentOutline} onClick={() => setAsking(true)}>
        Require retake
      </button>
    );
  return (
    <span className="inline-flex items-center gap-2 text-[13px]">
      <span className="text-muted">{name} takes it again?</span>
      <button
        type="button"
        disabled={pending}
        className="font-medium text-bad"
        onClick={() =>
          start(async () => {
            const r = await resetAttemptForRetake({ kind, attemptId });
            setMessage(r.ok ?? r.error ?? null);
          })
        }
      >
        Yes
      </button>
      <button type="button" className="text-muted" onClick={() => setAsking(false)}>
        No
      </button>
    </span>
  );
}

/** The class league switch: a small track and knob, like the design's toggles. */
export function LeagueToggle({ classId, on }: { classId: string; on: boolean }) {
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={pending}
      onClick={() => {
        const next = !value;
        setValue(next);
        start(() => setLeague(classId, next));
      }}
      className="flex items-center gap-3 rounded-lg bg-surface p-3 text-left"
    >
      <span className={cx("relative h-5 w-[34px] shrink-0 rounded-full transition-colors", value ? "bg-accent" : "bg-[var(--color-neutral-700)]")}>
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-[var(--color-neutral-100)] transition-[left]", value ? "left-4" : "left-0.5")} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px]">Weekly league</span>
        <span className="text-xs text-muted">Students see a ranking by this week&apos;s XP. The class goal stays on either way.</span>
      </span>
    </button>
  );
}
