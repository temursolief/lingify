"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { restartAttempt, retryAnswer, submitPassage, tagMistake } from "@/app/actions/passage";
import type { AttemptView, Evidence } from "@/lib/passages";
import type { PassageSubmission } from "@/lib/submissions";
import { clearDraft, loadDraft, saveDraft } from "@/lib/test-draft";
import type { Tag } from "./question-footer";

const fromView = (v: AttemptView) => ({
  answers: Object.fromEntries(v.questions.map((q) => [q.number, q.answer])) as Record<number, string>,
  proofs: Object.fromEntries(v.questions.filter((q) => q.evidence).map((q) => [q.number, q.evidence!])) as Record<number, Evidence>,
});

/**
 * One passage attempt in the browser: the server's view of it, the answers and proofs being written, and the actions
 * on it. The first submission survives a lost connection: it is saved on the device and sent again every few
 * seconds until the server has it (and on the next visit, if the tab was closed first).
 */
export function useAttempt(passageId: string, initial: AttemptView) {
  const [view, setView] = useState(initial);
  const [answers, setAnswers] = useState(() => fromView(initial).answers);
  const [proofs, setProofs] = useState(() => fromView(initial).proofs);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [sending, setSending] = useState<"idle" | "sending" | "failed">("idle");
  const [pending, start] = useTransition();
  const finishing = useRef(false);
  const latest = useRef({ answers, proofs });
  useEffect(() => {
    latest.current = { answers, proofs };
  }, [answers, proofs]);

  const stateOf = useMemo(() => new Map(view.questions.map((q) => [q.number, q])), [view.questions]);

  /** Answers written before a reload come back when the test starts again. */
  const restoreDraft = useCallback(() => {
    const d = loadDraft(view.id);
    if (d.answers) setAnswers((a) => ({ ...a, ...d.answers }));
    if (d.proofs) setProofs((p) => ({ ...p, ...(d.proofs as Record<number, Evidence>) }));
  }, [view.id]);

  const setAnswer = useCallback(
    (n: number, value: string) => {
      setAnswers((a) => {
        const next = { ...a, [n]: value };
        if (!view.submitted) saveDraft(view.id, { answers: next });
        return next;
      });
      setErrors((e) => (e[n] ? { ...e, [n]: "" } : e));
    },
    [view.id, view.submitted],
  );

  const setProof = useCallback(
    (n: number, ev: Evidence | null) => {
      setProofs((p) => {
        const next = { ...p };
        if (ev) next[n] = ev;
        else delete next[n];
        if (!view.submitted) saveDraft(view.id, { proofs: next });
        return next;
      });
      setErrors((e) => ({ ...e, [n]: "" }));
    },
    [view.id, view.submitted],
  );

  /** The first submission, whatever ended the test. Only the first call does anything. */
  const finish = useCallback((payload: PassageSubmission) => {
    if (finishing.current) return;
    finishing.current = true;
    saveDraft(payload.attemptId, { pending: payload });
    setSending("sending");
    const send = () =>
      submitPassage(payload).then(
        (v) => {
          clearDraft(payload.attemptId);
          setView(v);
          setSending("idle");
        },
        () => {
          setSending("failed");
          setTimeout(send, 5000);
        },
      );
    void send();
  }, []);

  /** The submission body: the answers as they are now, and what the proctor and telemetry collected. */
  const submission = useCallback(
    (meta: PassageSubmission["meta"], seconds: number): PassageSubmission => ({
      attemptId: view.id,
      passageId,
      answers: Object.fromEntries(Object.entries(latest.current.answers).map(([k, v]) => [k, v ?? ""])),
      evidence: Object.fromEntries(Object.entries(latest.current.proofs)),
      seconds: Math.min(4 * 3600, Math.max(0, Math.round(seconds))),
      meta,
    }),
    [view.id, passageId],
  );

  // The button always answers: a student who has not yet chosen a new answer or highlighted the proof is told so,
  // instead of facing a grey button that does nothing. Says "proof-missing" when the highlight is what is missing.
  const retry = (n: number): "proof-missing" | void => {
    const answer = (answers[n] ?? "").trim();
    const why = !answer || answer.toUpperCase() === (stateOf.get(n)?.answer ?? "").toUpperCase()
      ? "Choose a different answer first."
      : !proofs[n]
        ? "Now highlight the sentence in the passage that proves your new answer, then press Check."
        : "";
    if (why) {
      setErrors((e) => ({ ...e, [n]: why }));
      return answer && !proofs[n] ? "proof-missing" : undefined;
    }
    start(async () => {
      const r = await retryAnswer({ attemptId: view.id, passageId, number: n, answer: answers[n] ?? "", evidence: proofs[n] ?? null });
      setView(r.view);
      setErrors((e) => ({ ...e, [n]: r.error ?? "" }));
    });
  };

  const tag = (n: number, t: Tag) =>
    start(async () => {
      setView(await tagMistake({ attemptId: view.id, passageId, number: n, tag: t }));
    });

  const again = (after: () => void) =>
    start(async () => {
      const v = await restartAttempt(passageId);
      finishing.current = false;
      setView(v);
      setAnswers({});
      setProofs({});
      after();
    });

  return { view, setView, answers, proofs, errors, stateOf, pending, sending, setAnswer, setProof, restoreDraft, finish, submission, retry, tag, again };
}
