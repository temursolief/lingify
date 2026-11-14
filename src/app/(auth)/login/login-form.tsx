"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { login, startTelegramLogin } from "@/app/actions/auth";
import { Button, Field } from "@/components/ui";

type Status = "idle" | "starting" | "waiting" | "unknown" | "pending" | "denied" | "expired" | "done" | "error";

const MESSAGES: Partial<Record<Status, { text: string; tone: "muted" | "warn" | "bad" | "good" }>> = {
  waiting: { text: "In Telegram, press Start, then “Yes, it’s me”.", tone: "muted" },
  unknown: { text: "This Telegram isn’t connected yet. New? Send the bot your class code. Have an account? Log in with email below, then connect Telegram in Settings.", tone: "warn" },
  pending: { text: "Your teacher hasn’t approved you yet. The bot will message you when they do.", tone: "warn" },
  denied: { text: "Log-in cancelled in Telegram.", tone: "bad" },
  expired: { text: "That log-in expired. Tap the button to try again.", tone: "bad" },
  done: { text: "Logged in. Opening Lingify…", tone: "good" },
};

/**
 * Students log in with Telegram: the button opens the bot, the student confirms there, and this page, polling with
 * the cookie it was given, is logged in. Teachers (and students from before Telegram log-in) use email and password.
 */
export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  const [status, setStatus] = useState<Status>("idle");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function poll(left: number) {
    const res = await fetch("/api/auth/telegram", { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { status: Status; home?: string } | null;
    if (body?.status === "done" && body.home) {
      setStatus("done");
      window.location.assign(body.home);
      return;
    }
    if (body && body.status !== "waiting") setStatus(body.status);
    if (body?.status === "expired" || body?.status === "denied" || left <= 0) return;
    timer.current = setTimeout(() => poll(left - 1), document.visibilityState === "visible" ? 2000 : 5000);
  }

  async function telegram() {
    setError(null);
    setStatus("starting");
    // Browsers only allow a new window during the click itself, not after waiting for the server: open it now and
    // send it to Telegram once the link is ready. If it is blocked anyway, the "Open the bot" link below does the job.
    const tab = window.open("", "_blank");
    const r = await startTelegramLogin();
    if ("error" in r) {
      tab?.close();
      setStatus("error");
      setError(r.error);
      return;
    }
    setLink(r.link);
    setStatus("waiting");
    if (tab) tab.location.href = r.link;
    if (timer.current) clearTimeout(timer.current);
    // About ten minutes of asking, as long as the log-in lasts.
    void poll(300);
  }

  const msg = MESSAGES[status];
  const tone = { muted: "text-muted", warn: "text-warn", bad: "text-bad", good: "text-good" };
  return (
    <div>
      <h1 className="text-center text-xl">Log in</h1>
      {notice && <p className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-center text-sm font-semibold text-warn">{notice}</p>}

      <p className="caps mt-5 mb-2 text-[12px] text-muted">Students</p>
      <Button type="button" onClick={telegram} disabled={status === "starting" || status === "done"} className="w-full">
        {status === "starting" ? "Opening Telegram…" : "Log in with Telegram"}
      </Button>
      {msg && (
        <p className={`mt-3 text-sm ${tone[msg.tone]}`} role="status">
          {msg.text}
        </p>
      )}
      {link && status !== "done" && (
        <p className="mt-1 text-sm text-muted">
          Telegram didn’t open? <a href={link} target="_blank" rel="noreferrer">Open the bot</a>.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-bad" role="alert">{error}</p>}
      <p className="mt-3 text-xs text-muted">New? Send your class code to the bot.</p>

      <details className="mt-6 border-t border-line pt-4" open={!!state?.error}>
        <summary className="caps cursor-pointer text-[12px] text-muted">Log in with email</summary>
        <form action={action} className="mt-3">
          <div className="space-y-4">
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            <Field label="Password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state?.error && <p className="mt-3 text-bad" role="alert">{state.error}</p>}
          <Button type="submit" variant="secondary" disabled={pending} className="mt-4 w-full">
            {pending ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </details>
    </div>
  );
}
