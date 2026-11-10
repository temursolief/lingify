"use client";

import { useState, useTransition } from "react";
import { setUzbekGlosses } from "@/app/actions/student";

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
