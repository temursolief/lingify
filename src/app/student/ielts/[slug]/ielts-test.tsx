"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { submitIelts } from "@/app/actions/ielts";
import { ActivityTracker } from "@/components/activity-tracker";
import { Button, ButtonLink, cx } from "@/components/ui";
import { paragraphLetter, TASK_LABEL, type PublicTask, type QuestionResult } from "@/lib/ielts";

type Result = Awaited<ReturnType<typeof submitIelts>>;
const TFNG = ["TRUE", "FALSE", "NOT GIVEN"] as const;

function mmss(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
}

export function IeltsTest({ text, paragraphs, tasks }: {
  text: { id: string; slug: string; title: string; timeLimit: number };
  paragraphs: string[];
  tasks: PublicTask[];
}) {
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [left, setLeft] = useState(text.timeLimit * 60);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const elapsed = useRef(0);
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  const totalQuestions = tasks.reduce((n, t) => n + t.items.length, 0);
  const answered = Object.values(answers).filter((a) => a.trim()).length;

  const submit = useCallback(() => {
    start(async () => {
      setResult(await submitIelts({ textId: text.id, answers: answersRef.current, seconds: elapsed.current }));
    });
  }, [text.id]);

  useEffect(() => {
    if (!started || result) return;
    const begin = Date.now();
    const timer = setInterval(() => {
      elapsed.current = Math.round((Date.now() - begin) / 1000);
      const remaining = text.timeLimit * 60 - elapsed.current;
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        submit();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [started, result, text.timeLimit, submit]);

  const set = (id: string, value: string) => setAnswers((a) => ({ ...a, [id]: value }));
  const resultFor = (id: string) => result?.results.find((r) => r.id === id);

  if (!started) {
    return (
      <div className="max-w-3xl">
        <p className="text-muted">IELTS Academic Reading practice</p>
        <h1 className="text-[2.25rem] leading-tight font-semibold">{text.title}</h1>
        <ul className="mt-4 list-disc space-y-1 pl-5">
          <li>You have <b>{text.timeLimit} minutes</b> for {totalQuestions} questions, the same pace as the real exam.</li>
          <li>No dictionary or word lookups during the test.</li>
          <li>For completion questions, use words from the passage and follow the word limit.</li>
          <li>The test is submitted automatically when time runs out.</li>
        </ul>
        <Button className="mt-6 px-4 py-2 text-xl" onClick={() => setStarted(true)}>Start the test</Button>
      </div>
    );
  }

  return (
    <div>
      {!result && <ActivityTracker activity="IELTS" />}
      <div className="sticky top-14 z-10 -mx-3 mb-3 flex flex-wrap items-center gap-4 border-b border-line bg-page px-3 py-2">
        <h1 className="text-xl font-semibold">{text.title}</h1>
        {!result ? (
          <>
            <span className={cx("font-mono text-xl tabular-nums", left < 120 && "text-bad")} aria-live="polite">{mmss(left)}</span>
            <span className="text-muted">{answered} of {totalQuestions} answered</span>
            <Button className="ml-auto" onClick={submit} disabled={pending}>{pending ? "Checking…" : "Submit answers"}</Button>
          </>
        ) : (
          <span className="ml-auto text-lg">
            <b>{result.correct}/{result.total}</b> correct · estimated band <b>{result.band}</b>
          </span>
        )}
      </div>

      {result && <ResultSummary result={result} slug={text.slug} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="space-y-4 font-serif text-[1.0625rem] leading-relaxed lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-3">
          {paragraphs.map((p, i) => (
            <p key={i}>
              <b className="mr-2">{paragraphLetter(i)}</b>
              {p}
            </p>
          ))}
        </article>

        <div className="space-y-8">
          {tasks.map((task, ti) => (
            <section key={ti}>
              <h2 className="text-lg font-semibold">{TASK_LABEL[task.type]}</h2>
              <p className="mb-3 text-sm text-muted">{task.instructions}</p>

              {task.type === "tfng" && (
                <ol className="space-y-3">
                  {task.items.map((it) => (
                    <li key={it.id}>
                      <p>{it.id.replace("q", "")}. {it.statement}</p>
                      <div className="mt-1 inline-flex">
                        {TFNG.map((opt, i) => (
                          <button
                            key={opt}
                            type="button"
                            disabled={!!result}
                            onClick={() => set(it.id, opt)}
                            className={cx(
                              "border border-accent px-2.5 py-1 text-sm",
                              i === 0 ? "rounded-l-md" : i === 2 ? "-ml-px rounded-r-md" : "-ml-px",
                              answers[it.id] === opt ? "bg-accent text-accent-ink" : "text-accent hover:bg-accent-soft",
                            )}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      <Feedback r={resultFor(it.id)} />
                    </li>
                  ))}
                </ol>
              )}

              {task.type === "headings" && (
                <>
                  <ol className="mb-3 list-[lower-roman] space-y-0.5 rounded-md border border-line bg-paper py-2 pr-3 pl-9 text-sm">
                    {task.headings.map((h, i) => <li key={i}>{h}</li>)}
                  </ol>
                  <ol className="space-y-2">
                    {task.items.map((it) => (
                      <li key={it.id} className="flex flex-wrap items-center gap-2">
                        <span>{it.id.replace("q", "")}. Paragraph {paragraphLetter(it.paragraph)}</span>
                        <select
                          value={answers[it.id] ?? ""}
                          disabled={!!result}
                          onChange={(e) => set(it.id, e.target.value)}
                          className="rounded-md border border-line bg-surface px-2 py-1"
                        >
                          <option value="">Choose a heading…</option>
                          {task.headings.map((h, i) => (
                            <option key={i} value={String(i)}>{["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"][i]}. {h}</option>
                          ))}
                        </select>
                        <Feedback r={resultFor(it.id)} />
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {task.type === "completion" && (
                <ol className="space-y-3">
                  {task.items.map((it) => (
                    <li key={it.id}>
                      {it.id.replace("q", "")}. {it.before}{" "}
                      <GapInput value={answers[it.id] ?? ""} disabled={!!result} onChange={(v) => set(it.id, v)} />{" "}
                      {it.after}
                      <Feedback r={resultFor(it.id)} />
                    </li>
                  ))}
                </ol>
              )}

              {task.type === "summary" && (
                <div className="rounded-md border border-line p-3 leading-loose">
                  {task.text.split(/(\{\{q\d+\}\})/).map((part, i) => {
                    const m = part.match(/^\{\{(q\d+)\}\}$/);
                    if (!m) return <span key={i}>{part}</span>;
                    return (
                      <span key={i}>
                        <span className="text-sm text-muted">({m[1].replace("q", "")})</span>{" "}
                        <GapInput value={answers[m[1]] ?? ""} disabled={!!result} onChange={(v) => set(m[1], v)} />
                      </span>
                    );
                  })}
                  {result && (
                    <div className="mt-2">
                      {task.items.map((it) => <Feedback key={it.id} r={resultFor(it.id)} label={`${it.id.replace("q", "")}.`} />)}
                    </div>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function GapInput({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      spellCheck={false}
      className="w-40 rounded-md border border-line bg-surface px-2 py-0.5 focus:border-[#86b7fe] focus:ring-4 focus:ring-accent/25 focus:outline-none"
    />
  );
}

function Feedback({ r, label }: { r?: QuestionResult; label?: string }) {
  if (!r) return null;
  return (
    <p className={cx("mt-1 text-sm", r.correct ? "text-good" : "text-warn")}>
      {label} {r.correct ? "✓ Correct." : `✗ Answer: ${r.expected}${r.given ? ` (you wrote “${r.given}”)` : ""}.`}{" "}
      <span className="text-muted">{r.explanation}</span>
    </p>
  );
}

function ResultSummary({ result, slug }: { result: Result; slug: string }) {
  return (
    <div className="mb-6 rounded-md border border-line bg-paper p-4">
      <p className="text-lg">
        You answered <b>{result.correct} of {result.total}</b> correctly. Estimated reading band: <b>{result.band}</b>.
      </p>
      <p className="mt-1 text-sm text-muted">One passage is a third of the real test, so treat the band as a rough guide. Your estimate on the IELTS page averages your last three passages.</p>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {Object.entries(result.byType).map(([type, s]) => (
          <li key={type}>{TASK_LABEL[type as keyof typeof TASK_LABEL]}: <b>{s.correct}/{s.total}</b></li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-3">
        <ButtonLink href={`/student/read/${slug}`}>Study this passage: words and phrases</ButtonLink>
        <Link href="/student/ielts" className="self-center">Back to IELTS</Link>
      </div>
    </div>
  );
}
