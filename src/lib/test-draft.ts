"use client";

import type { AttemptTelemetry, IntegrityEvent } from "./telemetry";

/**
 * A first try in progress, kept in sessionStorage so a reload or a dropped connection loses nothing: the answers,
 * the telemetry, the integrity events and, once the test has ended, the submission still waiting to be sent.
 * sessionStorage is per tab and gone when the tab closes, which is what a test needs. Every access may throw
 * (private windows, storage full), so every access is guarded and the test works without it.
 */
export type TestDraft = {
  answers?: Record<string, string>;
  proofs?: Record<string, unknown>;
  telemetry?: Partial<AttemptTelemetry> & { perQuestionMs?: Record<string, number> };
  events?: IntegrityEvent[];
  warningsUsed?: number;
  /** a submission that has not reached the server yet */
  pending?: unknown;
};

const key = (attemptId: string) => `lingify-test:${attemptId}`;

export function loadDraft(attemptId: string): TestDraft {
  try {
    return JSON.parse(sessionStorage.getItem(key(attemptId)) ?? "{}") as TestDraft;
  } catch {
    return {};
  }
}

export function saveDraft(attemptId: string, change: Partial<TestDraft>) {
  try {
    sessionStorage.setItem(key(attemptId), JSON.stringify({ ...loadDraft(attemptId), ...change }));
  } catch {
    // no storage: the test goes on, it just cannot survive a reload
  }
}

export function clearDraft(attemptId: string) {
  try {
    sessionStorage.removeItem(key(attemptId));
  } catch {
    // nothing to clear
  }
}
