"use client";

import { useEffect, useRef } from "react";

type Activity = "READING" | "QUIZ" | "VOCAB" | "GRAMMAR" | "REVIEW" | "FLUENCY" | "IELTS" | "PLACEMENT";

const FLUSH_EVERY_MS = 15_000;
/** Reading a long paragraph can take a while without touching anything, so reading tolerates longer pauses. */
const IDLE_AFTER_MS: Record<Activity, number> = {
  READING: 120_000,
  QUIZ: 60_000,
  VOCAB: 60_000,
  GRAMMAR: 60_000,
  REVIEW: 60_000,
  FLUENCY: 60_000,
  IELTS: 120_000,
  PLACEMENT: 60_000,
};

const flushers = new Set<() => Promise<void>>();

/** Sends any active time not yet reported, e.g. before finishing a text so its reading speed uses all of it. */
export async function flushActivity() {
  await Promise.all([...flushers].map((f) => f()));
}

/** Counts seconds only while the tab is visible and the learner has interacted recently, and reports them to the server. */
export function ActivityTracker({ activity, sessionId }: { activity: Activity; sessionId?: string }) {
  const pending = useRef(0);
  const lastInteraction = useRef(0);

  useEffect(() => {
    lastInteraction.current = Date.now();
    const send = (useBeacon: boolean) => {
      const seconds = Math.min(60, pending.current);
      if (seconds <= 0) return;
      pending.current -= seconds;
      const body = JSON.stringify({ activity, seconds, sessionId });
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/heartbeat", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/heartbeat", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {
          pending.current += seconds;
        });
      }
    };

    const flushNow = async () => {
      const seconds = Math.min(60, pending.current);
      if (seconds <= 0) return;
      pending.current -= seconds;
      await fetch("/api/heartbeat", {
        method: "POST",
        body: JSON.stringify({ activity, seconds, sessionId }),
        headers: { "Content-Type": "application/json" },
      }).catch(() => {
        pending.current += seconds;
      });
    };
    flushers.add(flushNow);

    const touch = () => {
      lastInteraction.current = Date.now();
    };
    const events = ["scroll", "pointermove", "pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastInteraction.current < IDLE_AFTER_MS[activity]) {
        pending.current += 1;
      }
    }, 1000);
    const flush = setInterval(() => send(false), FLUSH_EVERY_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") send(true);
    };
    const onPageHide = () => send(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(tick);
      clearInterval(flush);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      flushers.delete(flushNow);
      send(true);
    };
  }, [activity, sessionId]);

  return null;
}
