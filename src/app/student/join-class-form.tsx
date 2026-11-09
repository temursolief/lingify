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
        className="w-36 rounded-lg border border-line bg-surface px-3 py-2 uppercase placeholder:normal-case focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-accent/25"
      />
      <Button type="submit" variant="secondary" disabled={pending}>Join class</Button>
      {state?.error && <p className="w-full text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="w-full text-sm text-good">{state.ok}</p>}
    </form>
  );
}
