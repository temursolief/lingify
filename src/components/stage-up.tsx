"use client";

import { useEffect, useState } from "react";
import { Confetti, X } from "./icons";

const KEY = "lingify:fortress-stage";

/**
 * The moment a new fortress stage is built: shown once, the first time Today opens after it. The last stage seen is
 * kept in this browser only (a nicety; nothing depends on it), so a first visit just remembers where the student is.
 */
export function StageUp({ stage, name, last }: { stage: number; name: string; last: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen: number | null = null;
    try {
      const v = localStorage.getItem(KEY);
      seen = v === null ? null : Number(v);
      localStorage.setItem(KEY, String(stage));
    } catch {
      return;
    }
    // Reading the browser's memory can only happen after mount, so the banner appears in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (seen !== null && Number.isFinite(seen) && stage > seen) setShow(true);
  }, [stage]);

  if (!show) return null;
  return (
    <div role="status" className="band flex items-center gap-3 rounded-xl border-l-4 border-gold bg-section px-4 py-3 motion-safe:animate-[drop-in_0.4s_ease-out]">
      <Confetti size={26} weight="fill" className="shrink-0 text-gold" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="kicker text-gold">New stage built</span>
        <span className="font-display text-xl font-bold">{last ? `You built the ${name}, the highest stage there is.` : `Your ${name} is ready. Keep going for the next one.`}</span>
      </div>
      <button type="button" onClick={() => setShow(false)} aria-label="Dismiss" className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink">
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
