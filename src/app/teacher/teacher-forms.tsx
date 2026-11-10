"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { assignPassage, createClass, deleteAssignment, deleteDeck, deletePassage, removeStudent, uploadPassage, type FormState } from "@/app/actions/teacher";
import { Button } from "@/components/ui";

const inputClass = "rounded-md border border-line bg-surface px-3 py-2 focus:border-accent focus:outline-none";

function Feedback({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <div className="w-full text-sm" aria-live="polite">
      {state.error && <p className="text-bad">{state.error}</p>}
      {state.errors && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 font-mono text-xs text-bad">
          {state.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {state.ok && <p className="text-good">{state.ok}</p>}
    </div>
  );
}

export function CreateClassForm() {
  const [state, action, pending] = useActionState(createClass, undefined);
  return (
    <form action={action} className="mt-3 flex flex-wrap gap-2">
      <input name="name" placeholder="e.g. IELTS Evening Group" aria-label="Class name" required className={`${inputClass} flex-1`} />
      <Button type="submit" disabled={pending}>Create</Button>
      <Feedback state={state} />
    </form>
  );
}

export function AssignPassageForm({
  classId,
  passages,
  students,
}: {
  classId: string;
  passages: { id: string; title: string; mine: boolean }[];
  students: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(assignPassage, undefined);
  const [some, setSome] = useState(false);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="classId" value={classId} />
      <label className="w-full text-sm">
        <span className="mb-1 block text-muted">Passage</span>
        <select name="passageId" required className={`${inputClass} w-full`} defaultValue="">
          <option value="" disabled>Choose a passage…</option>
          {passages.some((p) => p.mine) && (
            <optgroup label="My passages">
              {passages.filter((p) => p.mine).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </optgroup>
          )}
          <optgroup label="Lingify passages">
            {passages.filter((p) => !p.mine).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </optgroup>
        </select>
      </label>
      <fieldset className="w-full text-sm">
        <label className="mr-4 inline-flex items-center gap-1.5">
          <input type="radio" checked={!some} onChange={() => setSome(false)} className="accent-[var(--accent)]" /> Whole class
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="radio" checked={some} onChange={() => setSome(true)} className="accent-[var(--accent)]" /> Some students
        </label>
        {some && (
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-md bg-paper p-2">
            {students.map((s) => (
              <label key={s.id} className="inline-flex items-center gap-1.5">
                <input type="checkbox" name="students" value={s.id} className="accent-[var(--accent)]" /> {s.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Due date</span>
        <input name="dueAt" type="date" className={inputClass} />
      </label>
      <label className="flex-1 text-sm">
        <span className="mb-1 block text-muted">Note (optional)</span>
        <input name="note" maxLength={200} className={`${inputClass} w-full`} placeholder="Focus on the headings" />
      </label>
      <Button type="submit" disabled={pending}>Assign</Button>
      <Feedback state={state} />
    </form>
  );
}

export function UploadPassageForm() {
  const [state, action, pending] = useActionState(uploadPassage, undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">JSON file</span>
        <input name="file" type="file" accept=".json,application/json" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-accent" />
      </label>
      <details className="text-sm">
        <summary className="cursor-pointer text-accent">or paste the JSON</summary>
        <textarea name="json" rows={8} className={`${inputClass} mt-2 w-full font-mono text-xs`} placeholder='{ "title": "…", "paragraphs": [ … ], "questionGroups": [ … ] }' />
      </details>
      <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Upload passage"}</Button>
      <Feedback state={state} />
    </form>
  );
}

function ConfirmButton({ label, confirmText, onConfirm }: { label: string; confirmText: string; onConfirm: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (!asking) return <button type="button" onClick={() => setAsking(true)} className="text-sm text-muted hover:text-bad">{label}</button>;
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted">{confirmText}</span>
      <button type="button" disabled={pending} onClick={() => start(onConfirm)} className="font-medium text-bad">Yes</button>
      <button type="button" onClick={() => setAsking(false)} className="text-muted">No</button>
    </span>
  );
}

export const DeleteAssignmentButton = ({ id }: { id: string }) => <ConfirmButton label="Remove" confirmText="Remove this assignment?" onConfirm={() => deleteAssignment(id)} />;
export const DeletePassageButton = ({ id }: { id: string }) => <ConfirmButton label="Delete" confirmText="Delete passage and its results?" onConfirm={() => deletePassage(id)} />;
export const DeleteDeckButton = ({ id }: { id: string }) => <ConfirmButton label="Delete" confirmText="Delete deck for every student?" onConfirm={() => deleteDeck(id)} />;
export const RemoveStudentButton = ({ classId, studentId, name }: { classId: string; studentId: string; name: string }) => (
  <ConfirmButton label="Remove from class" confirmText={`Remove ${name}?`} onConfirm={() => removeStudent(classId, studentId)} />
);

/** Uploads an .apkg to the import route (a plain request, so large decks are not limited like form actions). */
export function UploadDeckForm() {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        start(async () => {
          setMessage(null);
          const res = await fetch("/api/decks/import", { method: "POST", body: new FormData(form) }).catch(() => null);
          const body = res ? await res.json().catch(() => ({})) : { error: "No connection to the server." };
          if (res?.ok) {
            setMessage({ ok: `“${body.name}” imported: ${body.cards} cards${body.media ? `, ${body.media} images and sounds` : ""}.` });
            form.reset();
            router.refresh();
          } else setMessage({ error: body.error ?? "The deck could not be imported." });
        });
      }}
    >
      <input name="file" type="file" accept=".apkg,.colpkg" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-accent" />
      <Button type="submit" disabled={pending}>{pending ? "Importing… large decks take a minute" : "Upload deck"}</Button>
      {message?.ok && <p className="text-sm text-good">{message.ok}</p>}
      {message?.error && <p className="text-sm text-bad">{message.error}</p>}
    </form>
  );
}
