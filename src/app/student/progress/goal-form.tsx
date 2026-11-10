"use client";

import { useActionState, useTransition } from "react";
import { removeGoal, setGoal } from "@/app/actions/student";
import { Button } from "@/components/ui";

const selectClass = "rounded-lg border border-line bg-surface px-3 py-2 focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-accent/25";

export function GoalForm() {
  const [state, action, pending] = useActionState(setGoal, undefined);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="mb-1 block text-muted">Each week I want to…</span>
        <select name="type" className={selectClass} defaultValue="WORDS_WEEK">
          <option value="WORDS_WEEK">read this many words</option>
          <option value="TEXTS_WEEK">finish this many texts</option>
          <option value="MINUTES_WEEK">practise this many minutes</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Target</span>
        <input name="target" type="number" min={1} defaultValue={3000} className={`${selectClass} w-28`} />
      </label>
      <Button type="submit" disabled={pending}>Set goal</Button>
      {state?.error && <p className="w-full text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="w-full text-sm text-good">{state.ok}</p>}
    </form>
  );
}

export function RemoveGoalButton({ goalId }: { goalId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => removeGoal(goalId))} className="text-xs text-muted underline hover:text-bad">
      Remove
    </button>
  );
}
