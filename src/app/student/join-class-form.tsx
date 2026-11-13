"use client";

import { useActionState } from "react";
import { joinClass } from "@/app/actions/student";
import { Button } from "@/components/ui";

export function JoinClassForm() {
  const [state, action, pending] = useActionState(joinClass, undefined);
  return (
    <form action={action} className="mt-4 flex flex-wrap items-start gap-2">
      <input
        name="code"
        placeholder="Class code"
        aria-label="Class code"
        autoComplete="off"
        className="min-h-9 w-36 rounded-md border border-line bg-page px-3 py-1.5 tracking-widest uppercase caret-accent placeholder:tracking-normal placeholder:normal-case hover:border-[color-mix(in_srgb,var(--ink)_40%,transparent)] focus:border-accent focus:outline-none"
      />
      <Button type="submit" disabled={pending}>Join class</Button>
      {state?.error && <p className="w-full text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="w-full text-sm text-good">{state.ok}</p>}
    </form>
  );
}
