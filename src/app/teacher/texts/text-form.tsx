"use client";

import { useActionState, useState, useTransition } from "react";
import { createTeacherText, deleteTeacherText } from "@/app/actions/teacher-texts";
import { Button } from "@/components/ui";

const input = "w-full rounded-md border border-line bg-surface px-3 py-1.5 focus:border-[#86b7fe] focus:ring-4 focus:ring-accent/25 focus:outline-none";
const GENRES = ["Short story", "Non-fiction", "News", "Biography", "Science", "Mystery", "IELTS-style"];

export function TextForm() {
  const [state, action, pending] = useActionState(createTeacherText, undefined);
  const [count, setCount] = useState(1);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_14rem]">
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Title</span>
          <input name="title" required maxLength={120} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Type</span>
          <select name="genre" className={input} defaultValue="Non-fiction">
            {GENRES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Short summary (optional)</span>
        <input name="summary" maxLength={300} className={input} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Text: leave an empty line between paragraphs</span>
        <textarea name="body" required rows={12} className={`${input} font-sans`} />
      </label>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm text-muted">Comprehension questions (optional, up to 5): mark the correct option</legend>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="rounded-md border border-line p-3">
            <input name={`q${i}`} placeholder={`Question ${i + 1}`} className={input} />
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {[0, 1, 2, 3].map((j) => (
                <label key={j} className="flex items-center gap-2">
                  <input type="radio" name={`q${i}a`} value={j} defaultChecked={j === 0} className="accent-[var(--accent)]" aria-label={`Option ${j + 1} is correct`} />
                  <input name={`q${i}o${j}`} placeholder={`Option ${j + 1}`} className={input} />
                </label>
              ))}
            </div>
          </div>
        ))}
        {count < 5 && <Button type="button" variant="secondary" onClick={() => setCount(count + 1)}>Add another question</Button>}
      </fieldset>

      <Button type="submit" disabled={pending}>{pending ? "Analysing the text…" : "Add text"}</Button>
      {state?.error && <p className="text-bad">{state.error}</p>}
      {state?.ok && <p className="text-good">{state.ok}</p>}
    </form>
  );
}

export function DeleteTextButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => confirm("Delete this text? Students' reading history for it will be removed.") && start(() => deleteTeacherText(id))}
      className="text-sm text-muted underline hover:text-bad"
    >
      Delete
    </button>
  );
}
