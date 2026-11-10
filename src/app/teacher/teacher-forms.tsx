"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { deleteLesson, uploadLesson } from "@/app/actions/listening";
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

type FileResult = { name: string; state: FormState };

/** Larger than any real passage or lesson; a bigger file is refused before it is read or sent. */
const MAX_JSON_BYTES = 400_000;

/**
 * Uploads passage (or listening lesson) JSON files. Any number of files can be chosen at once: they are checked
 * and saved one at a time, so each request stays small and one bad file does not stop the others. The list on the
 * page is refreshed once, at the end.
 */
export function UploadPassageForm({ lesson = false }: { lesson?: boolean }) {
  const router = useRouter();
  const [results, setResults] = useState<FileResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [empty, setEmpty] = useState(false);
  const save = lesson ? uploadLesson : uploadPassage;

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const files = data.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    const pasted = String(data.get("json") ?? "").trim();
    const items: { name: string; read: () => Promise<string | null> }[] = files.map((f) => ({ name: f.name, read: async () => (f.size > MAX_JSON_BYTES ? null : f.text()) }));
    if (pasted) items.push({ name: "Pasted JSON", read: async () => pasted });
    setEmpty(!items.length);
    if (!items.length) return;

    setResults([]);
    setProgress({ done: 0, total: items.length });
    const done: FileResult[] = [];
    for (const item of items) {
      let state: FormState;
      try {
        const raw = await item.read();
        state = raw === null ? { error: "That file is too large." } : await save(raw);
      } catch {
        state = { error: "Could not be sent. Check the connection and upload this file again." };
      }
      done.push({ name: item.name, state });
      setResults([...done]);
      setProgress({ done: done.length, total: items.length });
    }
    setProgress(null);
    if (done.some((r) => r.state?.ok)) {
      // Keep what failed visible; the saved files are cleared from the form.
      if (done.every((r) => r.state?.ok)) form.reset();
      router.refresh();
    }
  }

  const saved = results.filter((r) => r.state?.ok).length;
  const failed = results.filter((r) => !r.state?.ok);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!progress) void submit(e.currentTarget);
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block text-muted">JSON files (choose one or many)</span>
        <input name="file" type="file" multiple accept=".json,application/json" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-accent" />
      </label>
      <details className="text-sm">
        <summary className="cursor-pointer text-accent">or paste the JSON</summary>
        <textarea name="json" rows={8} className={`${inputClass} mt-2 w-full font-mono text-xs`} placeholder={lesson ? '{ "title": "…", "video": "https://www.youtube.com/watch?v=…", "questionGroups": [ … ], "vocabulary": [ … ] }' : '{ "title": "…", "paragraphs": [ … ], "questionGroups": [ … ] }'} />
      </details>
      <Button type="submit" disabled={!!progress}>
        {progress ? `Checking ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : lesson ? "Upload lessons" : "Upload passages"}
      </Button>
      <div className="space-y-2 text-sm" aria-live="polite">
        {empty && <p className="text-bad">Choose a .json file or paste the JSON.</p>}
        {!progress && results.length > 1 && (
          <p className={failed.length ? "text-ink" : "text-good"}>
            {saved} of {results.length} saved{failed.length ? `, ${failed.length} not saved:` : "."}
          </p>
        )}
        {(results.length === 1 ? results : failed).map((r, i) => (
          <div key={i}>
            {results.length > 1 && <p className="font-medium">{r.name}</p>}
            <Feedback state={r.state} />
          </div>
        ))}
        {!failed.length && saved > 0 && !progress && <p className="text-muted">{lesson ? "They are now in every student's Listening library." : "Assign them from a class."}</p>}
      </div>
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
export const DeleteLessonButton = ({ id }: { id: string }) => <ConfirmButton label="Delete" confirmText="Delete lesson and students' results?" onConfirm={() => deleteLesson(id)} />;
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
