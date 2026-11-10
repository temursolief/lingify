"use client";

import { useEffect, useRef } from "react";

type Activity = "IELTS" | "REVIEW";

const FLUSH_EVERY_MS = 30_000;
/** Reading a long paragraph can take a while without touching anything, so passages tolerate longer pauses. */
const IDLE_AFTER_MS: Record<Activity, number> = { IELTS: 120_000, REVIEW: 60_000 };

/** Counts seconds only while the tab is visible and the learner has interacted recently, and reports them to the server. */
export function ActivityTracker({ activity }: { activity: Activity }) {
  const pending = useRef(0);
  const lastInteraction = useRef(0);

  useEffect(() => {
    lastInteraction.current = Date.now();
    const send = (useBeacon: boolean) => {
      const seconds = Math.min(60, pending.current);
      if (seconds <= 0) return;
      pending.current -= seconds;
      const body = JSON.stringify({ activity, seconds });
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/heartbeat", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/heartbeat", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {
          pending.current += seconds;
        });
      }
    };

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
      send(true);
    };
  }, [activity]);

  return null;
}
