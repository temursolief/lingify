"use client";

import { useCallback, useEffect, useRef } from "react";
import { loadDraft, saveDraft } from "./test-draft";
import { answerPace, AttemptTelemetrySchema, type AttemptTelemetry } from "./telemetry";

type Collected = {
  perQuestionMs: Record<string, number>;
  answerTimes: Record<string, number>;
  changeCounts: Record<string, number>;
  audioSeekCount: number;
  audioPauseCount: number;
  playbackRateChanges: number;
};

/**
 * Per-question telemetry for a first try, collected in memory with no requests: how long each question had the
 * student's attention, when each was first answered, how often answers changed, and (Listening) how the video was
 * used. It all travels inside the one Submit request. Time counts only while the tab is visible.
 */
export function useQuestionTelemetry({ attemptId, running, startedAtMs }: { attemptId: string; running: boolean; startedAtMs: number | null }) {
  const data = useRef<Collected | null>(null);
  const active = useRef<{ n: number; since: number | null } | null>(null);
  const start = useRef(startedAtMs);

  const get = useCallback((): Collected => {
    if (!data.current) {
      const saved = loadDraft(attemptId).telemetry;
      data.current = {
        perQuestionMs: saved?.perQuestionMs ?? {},
        answerTimes: saved?.answerTimes ?? {},
        changeCounts: saved?.changeCounts ?? {},
        audioSeekCount: saved?.audioSeekCount ?? 0,
        audioPauseCount: saved?.audioPauseCount ?? 0,
        playbackRateChanges: saved?.playbackRateChanges ?? 0,
      };
    }
    return data.current;
  }, [attemptId]);

  /** Adds the time the current question has had attention so far. */
  const commit = useCallback(() => {
    const a = active.current;
    if (!a || a.since === null) return;
    const now = Date.now();
    const d = get();
    d.perQuestionMs[a.n] = (d.perQuestionMs[a.n] ?? 0) + (now - a.since);
    a.since = now;
  }, [get]);

  const elapsedMs = useCallback(() => (start.current === null ? 0 : Math.max(0, Date.now() - start.current)), []);

  useEffect(() => {
    if (startedAtMs !== null) start.current = startedAtMs;
  }, [startedAtMs]);

  const persist = useCallback(() => {
    commit();
    saveDraft(attemptId, { telemetry: { ...get() } });
  }, [attemptId, commit, get]);

  // Time stops while the tab is hidden; the draft is saved every few seconds and when the tab is hidden.
  useEffect(() => {
    if (!running) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        persist();
        if (active.current) active.current.since = null;
      } else if (active.current) active.current.since = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const save = setInterval(persist, 3000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(save);
      persist();
    };
  }, [running, persist]);

  /** The student is now on question n (focused its input, clicked in it, chose an option). */
  const focusQuestion = useCallback(
    (n: number) => {
      if (!running || active.current?.n === n) return;
      commit();
      active.current = { n, since: document.visibilityState === "visible" ? Date.now() : null };
    },
    [running, commit],
  );

  /** An answer was given or changed. The first non-empty one sets the question's place in the answer order. */
  const answered = useCallback(
    (n: number, value: string) => {
      if (!running) return;
      const d = get();
      d.changeCounts[n] = (d.changeCounts[n] ?? 0) + 1;
      if (value.trim() && d.answerTimes[n] === undefined) d.answerTimes[n] = Math.round(elapsedMs() / 100) / 10;
      focusQuestion(n);
    },
    [running, get, elapsedMs, focusQuestion],
  );

  /** Listening: what the student did with the video. */
  const videoEvent = useCallback(
    (type: "seek" | "pause" | "rate") => {
      if (!running) return;
      const d = get();
      if (type === "seek") d.audioSeekCount++;
      else if (type === "pause") d.audioPauseCount++;
      else d.playbackRateChanges++;
    },
    [running, get],
  );

  /** Everything collected, in the shape the server validates. */
  const snapshot = useCallback(
    (listening = false): AttemptTelemetry => {
      commit();
      const d = get();
      const perQuestionSec = Object.fromEntries(Object.entries(d.perQuestionMs).map(([n, ms]) => [n, Math.round(ms / 1000)]));
      return AttemptTelemetrySchema.parse({
        durationSec: Math.round(elapsedMs() / 1000),
        perQuestionSec,
        answerTimes: d.answerTimes,
        changeCounts: d.changeCounts,
        ...answerPace(d.answerTimes),
        ...(listening ? { audioSeekCount: d.audioSeekCount, audioPauseCount: d.audioPauseCount, playbackRateChanges: d.playbackRateChanges } : {}),
      });
    },
    [commit, get, elapsedMs],
  );

  return { focusQuestion, answered, videoEvent, snapshot, elapsedMs };
}
