"use client";

import { useActionState, useTransition } from "react";
import { assignGoal, assignText, createClass, deleteAssignment, removeStudent, type FormState } from "@/app/actions/teacher";
import { Button } from "@/components/ui";

const inputClass = "rounded-lg border border-line bg-surface px-3 py-2 focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-accent/25";

function Feedback({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <div className="w-full text-sm" aria-live="polite">
      {state.error && <p className="text-bad">{state.error}</p>}
      {state.ok && <p className="text-good">{state.ok}</p>}
      {state.skipped && state.skipped.length > 0 && (
        <p className="mt-1 text-muted">
          Not assigned (below 95% known words): {state.skipped.map((s) => `${s.name} (${(s.coverage * 100).toFixed(1)}%)`).join(", ")}
        </p>
      )}
    </div>
  );
}

export function CreateClassForm() {
  const [state, action, pending] = useActionState(createClass, undefined);
  return (
    <form action={action} className="mt-3 flex flex-wrap gap-2">
      <input name="name" placeholder="e.g. B1 Evening Group" aria-label="Class name" required className={`${inputClass} flex-1`} />
      <Button type="submit" disabled={pending}>Create</Button>
      <Feedback state={state} />
    </form>
  );
}

export function AssignTextForm({ classId, texts }: { classId: string; texts: { id: string; title: string; genre: string }[] }) {
  const [state, action, pending] = useActionState(assignText, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="classId" value={classId} />
      <label className="flex-1 text-sm">
        <span className="mb-1 block text-muted">Text</span>
        <select name="textId" required className={`${inputClass} w-full`} defaultValue="">
          <option value="" disabled>Choose a text…</option>
          {texts.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.genre})</option>)}
        </select>
      </label>
      <label className="flex-1 text-sm">
        <span className="mb-1 block text-muted">Note (optional)</span>
        <input name="note" maxLength={200} className={`${inputClass} w-full`} placeholder="Read before Friday" />
      </label>
      <Button type="submit" disabled={pending}>Assign</Button>
      <Feedback state={state} />
    </form>
  );
}

export function AssignGoalForm({ classId }: { classId: string }) {
  const [state, action, pending] = useActionState(assignGoal, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="classId" value={classId} />
      <label className="text-sm">
        <span className="mb-1 block text-muted">Every week, each student should…</span>
        <select name="goalType" className={inputClass} defaultValue="WORDS_WEEK">
          <option value="WORDS_WEEK">read this many words</option>
          <option value="TEXTS_WEEK">finish this many texts</option>
          <option value="MINUTES_WEEK">practise this many minutes</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Target</span>
        <input name="target" type="number" min={1} defaultValue={2000} className={`${inputClass} w-28`} />
      </label>
      <label className="flex-1 text-sm">
        <span className="mb-1 block text-muted">Note (optional)</span>
        <input name="note" maxLength={200} className={`${inputClass} w-full`} />
      </label>
      <Button type="submit" disabled={pending}>Set goal</Button>
      <Feedback state={state} />
    </form>
  );
}

export function DeleteAssignmentButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => confirm("Remove this assignment?") && start(() => deleteAssignment(id))}
      className="text-xs text-muted underline hover:text-bad"
    >
      Remove
    </button>
  );
}

export function RemoveStudentButton({ classId, studentId, name }: { classId: string; studentId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => confirm(`Remove ${name} from this class? Their progress is kept.`) && start(() => removeStudent(classId, studentId))}
    >
      Remove from class
    </Button>
  );
}
