"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

function mmss(s: number) {
  return `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
}

/**
 * The exam clock, counting from when the test started (`startedAtMs`, so a resumed test keeps its time). It keeps its
 * own state, so a tick redraws these few characters and not the passage and questions.
 */
export function Timer({ seconds, startedAtMs, onTick, onEnd }: { seconds: number; startedAtMs: number; onTick: (elapsed: number) => void; onEnd: () => void }) {
  const [left, setLeft] = useState(() => seconds - Math.round((Date.now() - startedAtMs) / 1000));
  useEffect(() => {
    const tick = () => {
      const elapsed = Math.round((Date.now() - startedAtMs) / 1000);
      onTick(elapsed);
      setLeft(seconds - elapsed);
      if (elapsed >= seconds) {
        clearInterval(timer);
        onEnd();
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [seconds, startedAtMs, onTick, onEnd]);
  return <span className={cx("font-mono text-lg tabular-nums", left < 120 && "text-bad")} aria-live="off">{mmss(left)}</span>;
}
