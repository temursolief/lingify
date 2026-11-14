"use client";

import { useState, useTransition } from "react";
import { approveJoin, declineJoin, nudgeStudent, resetAttemptForRetake, setLeague } from "@/app/actions/teacher";
import { accentOutline, cx, quietOutline } from "@/components/ui";

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

/**
 * Students waiting to join the class: approve to let them log in (the bot tells them), or decline. Shown on every
 * tab of the class page until answered.
 */
export function JoinRequests({ classId, requests }: { classId: string; requests: { id: string; name: string; username: string | null; naming: boolean }[] }) {
  const [busy, start] = useTransition();
  const [done, setDone] = useState<Record<string, "approved" | "declined">>({});
  return (
    <div className="mb-4 rounded-xl border border-gold bg-warn-soft p-4">
      <p className="caps text-[15px] text-warn">
        {requests.length} student{requests.length === 1 ? "" : "s"} asking to join
      </p>
      <p className="mt-0.5 text-sm text-soft">They asked with the class code through the Telegram bot. Approved students can log in; the bot tells them.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{r.name}</span>
              {r.username && <span className="ml-1.5 text-sm text-muted">@{r.username}</span>}
              {r.naming && <span className="ml-1.5 text-xs text-muted">(still telling the bot their name)</span>}
            </span>
            {done[r.id] ? (
              <span className="text-sm text-muted">{done[r.id] === "approved" ? "Approved" : "Declined"}</span>
            ) : (
              <span className="flex gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  className={accentOutline}
                  onClick={() =>
                    start(async () => {
                      await approveJoin(classId, r.id);
                      setDone((d) => ({ ...d, [r.id]: "approved" }));
                    })
                  }
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={quietOutline}
                  onClick={() =>
                    start(async () => {
                      await declineJoin(classId, r.id);
                      setDone((d) => ({ ...d, [r.id]: "declined" }));
                    })
                  }
                >
                  Decline
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
