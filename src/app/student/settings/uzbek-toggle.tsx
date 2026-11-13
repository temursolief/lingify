"use client";

import { useState, useTransition } from "react";
import { setTargetBand, setUzbekGlosses } from "@/app/actions/student";
import { cx } from "@/components/ui";

export function UzbekToggle({ on }: { on: boolean }) {
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  return (
    <label className="mt-3 flex items-center gap-2">
      <input
        type="checkbox"
        checked={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setValue(next);
          start(() => setUzbekGlosses(next));
        }}
        className="accent-[var(--accent)]"
      />
      Show Uzbek (O‘zbekcha)
    </label>
  );
}

const BANDS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

/** The goal at the end of the band path, as a segmented row of half bands. */
export function TargetBandPicker({ value }: { value: number }) {
  const [band, setBand] = useState(value);
  const [pending, start] = useTransition();
  return (
    <div role="radiogroup" aria-label="Target band" className="mt-3 flex max-w-full flex-wrap overflow-hidden rounded-md border border-line">
      {BANDS.map((b) => (
        <button
          key={b}
          type="button"
          role="radio"
          aria-checked={band === b}
          disabled={pending}
          onClick={() => {
            setBand(b);
            start(() => setTargetBand(b));
          }}
          className={cx(
            "min-w-11 flex-1 border-line px-2 py-1.5 text-[13px] tabular-nums not-first:border-l",
            band === b ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--color-accent-200)]" : "text-soft hover:bg-hover",
          )}
        >
          {b.toFixed(1)}
        </button>
      ))}
    </div>
  );
}
