"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { loadDraft, saveDraft } from "./test-draft";
import { FOCUS_EVENTS, type IntegrityEvent, type IntegrityEventType, type ProctoringPolicy, type SubmissionReason } from "./telemetry";

/** Seconds a WARN_ONCE student has to come back before the test is submitted. */
export const GRACE_SECONDS = 5;
/** One action (alt-tab) can fire blur, fullscreen exit and visibility together: within this, they are one incident. */
const SAME_INCIDENT_MS = 1500;
/** Events other than focus losses stop being recorded past this many (the server takes at most 300). */
const MAX_EVENTS = 280;

type FocusReason = Extract<SubmissionReason, "TAB_HIDDEN" | "WINDOW_BLUR" | "FULLSCREEN_EXIT">;
export type ProctorWarning = { reason: FocusReason; deadline: number };

type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const fsDoc = () => document as FullscreenDoc;
const inFullscreen = () => !!(fsDoc().fullscreenElement ?? fsDoc().webkitFullscreenElement);

/**
 * Whether this browser can put the page in fullscreen. iPhones cannot (Safari has no Fullscreen API outside video),
 * so there the lock is the Page Visibility API alone: leaving the tab or the app still ends the test.
 */
export function fullscreenSupported() {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as FullscreenEl;
  return !!(fsDoc().fullscreenEnabled || fsDoc().webkitFullscreenEnabled) && !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

/** Nothing changes support at runtime; one notification right after mount makes React read the browser's answer. */
const onceAfterMount = (notify: () => void) => {
  const t = setTimeout(notify, 0);
  return () => clearTimeout(t);
};
/** fullscreenSupported() for rendering: false on the server and during hydration, the real answer after. */
export function useFullscreenSupported() {
  return useSyncExternalStore(onceAfterMount, fullscreenSupported, () => false);
}

/** Rejects if the browser neither grants nor refuses fullscreen within this time (some embedded views never answer). */
const FULLSCREEN_WAIT_MS = 2000;

function requestFullscreen(): Promise<void> {
  const el = document.documentElement as FullscreenEl;
  const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!request) return Promise.reject(new Error("no fullscreen"));
  return Promise.race([
    Promise.resolve(request()).then(() => undefined),
    new Promise<void>((resolve, reject) => setTimeout(() => (inFullscreen() ? resolve() : reject(new Error("fullscreen did not answer"))), FULLSCREEN_WAIT_MS)),
  ]);
}

export function exitFullscreen() {
  if (typeof document === "undefined" || !inFullscreen()) return;
  const d = fsDoc();
  void (d.exitFullscreen?.bind(d) ?? d.webkitExitFullscreen?.bind(d))?.()?.catch?.(() => {});
}

/**
 * The test lock for a first try (Reading and Listening). Active only between "Start test" and the first submission.
 *
 * - Fullscreen: required on desktop and Android under STRICT and WARN_ONCE; not on iPhones (see fullscreenSupported).
 * - Leaving: a hidden tab, another window focused, fullscreen exited, or the page left (also through an in-app link
 *   or the back button). STRICT ends the test at once; WARN_ONCE gives one 5-second warning, then ends it; NONE
 *   (practice) only records it. Focus moving into the lesson's video frame is not leaving.
 * - Ending: `onFinish(reason)` asks the page to submit. When the page itself is going away, `beacon(reason)` sends
 *   the same submission with navigator.sendBeacon, which survives the tab closing.
 * - Guards: copy, cut and the context menu are blocked in the test; paste into answers is blocked (logged in
 *   practice); Ctrl/Cmd+F is blocked in Reading; developer-tools shortcuts are blocked and logged.
 *
 * A network drop is none of these: nothing here looks at the connection.
 */
export function useTestProctor({
  attemptId,
  policy,
  kind,
  enabled,
  rootRef,
  elapsedMs,
  activeQuestion,
  onFinish,
  beacon,
}: {
  attemptId: string;
  policy: ProctoringPolicy;
  kind: "reading" | "listening";
  /** the first try has not been submitted */
  enabled: boolean;
  rootRef: RefObject<HTMLElement | null>;
  elapsedMs: () => number;
  activeQuestion: () => number | null;
  onFinish: (reason: FocusReason) => void;
  beacon: (reason: FocusReason) => void;
}) {
  const [running, setRunning] = useState(false);
  const [warning, setWarning] = useState<ProctorWarning | null>(null);
  const [needsFullscreen, setNeedsFullscreen] = useState(false);
  const events = useRef<IntegrityEvent[] | null>(null);
  const warningsUsed = useRef(0);
  const warnedAt = useRef(0);
  const away = useRef(false);
  const finished = useRef(false);
  const live = useRef({ onFinish, beacon, elapsedMs, activeQuestion, policy, kind });
  useEffect(() => {
    live.current = { onFinish, beacon, elapsedMs, activeQuestion, policy, kind };
  });

  const eventList = useCallback(() => {
    if (!events.current) {
      const saved = loadDraft(attemptId);
      events.current = saved.events ?? [];
      warningsUsed.current = saved.warningsUsed ?? 0;
    }
    return events.current;
  }, [attemptId]);

  const record = useCallback(
    (type: IntegrityEventType) => {
      const list = eventList();
      if (list.length >= MAX_EVENTS && !(FOCUS_EVENTS as readonly string[]).includes(type)) return;
      const q = live.current.activeQuestion();
      list.push({ type, atMs: Math.round(live.current.elapsedMs()), ...(q !== null ? { questionNumber: q } : {}) });
      saveDraft(attemptId, { events: list, warningsUsed: warningsUsed.current });
    },
    [attemptId, eventList],
  );

  const finish = useCallback((reason: FocusReason, viaBeacon = false) => {
    if (finished.current) return;
    finished.current = true;
    setWarning(null);
    setRunning(false);
    if (viaBeacon) live.current.beacon(reason);
    live.current.onFinish(reason);
  }, []);

  /** The student's attention left the test. */
  const violation = useCallback(
    (reason: FocusReason) => {
      if (finished.current) return;
      record(reason);
      const { policy } = live.current;
      if (policy === "NONE") return;
      // STRICT: the first one ends the test. The page may be about to freeze, so the beacon goes too.
      if (policy === "STRICT") return finish(reason, reason === "TAB_HIDDEN");
      const now = Date.now();
      if (warningsUsed.current === 0) {
        warningsUsed.current = 1;
        warnedAt.current = now;
        saveDraft(attemptId, { warningsUsed: 1 });
        setWarning({ reason, deadline: now + GRACE_SECONDS * 1000 });
        return;
      }
      if (now - warnedAt.current < SAME_INCIDENT_MS) return;
      finish(reason, reason === "TAB_HIDDEN");
    },
    [attemptId, record, finish],
  );

  /** Called from the "Start test" click: fullscreen must be requested inside the user's gesture. */
  const start = useCallback(async () => {
    finished.current = false;
    away.current = false;
    let needs = live.current.policy !== "NONE" && fullscreenSupported();
    if (needs) {
      try {
        await requestFullscreen();
      } catch {
        // Refused (or inside a frame that does not allow it): the test still runs, locked by visibility only.
        needs = false;
        record("NO_FULLSCREEN");
      }
    }
    setNeedsFullscreen(needs);
    setRunning(true);
  }, [record]);

  /** "Return to the test" on the warning: back into fullscreen (a click, so it is allowed), then carry on. */
  const resume = useCallback(() => {
    const ok = () => {
      away.current = false;
      setWarning(null);
    };
    if (needsFullscreen && !inFullscreen()) requestFullscreen().then(ok, () => {});
    else ok();
  }, [needsFullscreen]);

  // The warning runs out: the test is submitted with the reason that caused it.
  useEffect(() => {
    if (!warning) return;
    const check = () => {
      if (Date.now() > warning.deadline) finish(warning.reason);
    };
    const t = setInterval(check, 250);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [warning, finish]);

  useEffect(() => {
    if (!running || !enabled) return;
    const isIframeFocus = () => document.activeElement?.tagName === "IFRAME";

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (!away.current) {
          away.current = true;
          violation("TAB_HIDDEN");
        }
      } else if (document.hasFocus()) away.current = false;
    };
    // Another window took focus. Checked a moment later, once the browser has moved focus (into the video frame,
    // which is fine, or away); a hidden tab is the visibility handler's to report.
    const checkFocus = () => {
      if (document.visibilityState === "hidden" || isIframeFocus()) return;
      if (!document.hasFocus()) {
        if (!away.current) {
          away.current = true;
          violation("WINDOW_BLUR");
        }
      } else if (!warning) away.current = false;
    };
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const onBlur = () => {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(checkFocus, 120);
    };
    // Focus inside the video frame never fires another blur on this window, so switching apps from there is caught
    // by asking every second (document.hasFocus() is true while the frame has focus).
    const poll = setInterval(checkFocus, 1000);
    const onFullscreen = () => {
      if (needsFullscreen && !inFullscreen()) violation("FULLSCREEN_EXIT");
    };
    // The page is going away (closed, reloaded, navigated): whatever is answered is submitted now, by beacon.
    const onPageHide = () => {
      if (live.current.policy === "NONE" || finished.current) return;
      record("TAB_HIDDEN");
      finish("TAB_HIDDEN", true);
    };

    const inTest = (t: EventTarget | null) => !!rootRef.current && t instanceof Node && rootRef.current.contains(t);
    const onCopy = (e: Event) => {
      if (!inTest(e.target)) return;
      e.preventDefault();
      record("COPY");
    };
    const onContextMenu = (e: Event) => {
      if (inTest(e.target)) e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!inTest(t) || !t?.closest("input, textarea")) return;
      if (live.current.policy !== "NONE") e.preventDefault();
      record("PASTE");
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (live.current.kind === "reading" && ((mod && k === "f") || e.key === "F3")) {
        e.preventDefault();
        record("FIND_KEY");
      } else if (e.key === "F12" || (mod && (e.shiftKey || e.altKey) && ["i", "j", "c"].includes(k))) {
        e.preventDefault();
        record("DEVTOOLS_KEY");
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", checkFocus);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("paste", onPaste, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(blurTimer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", checkFocus);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("paste", onPaste, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [running, enabled, needsFullscreen, warning, violation, finish, record, rootRef]);

  // Leaving the page inside the app (a link, the back button): Next.js keeps the page alive but hidden, which tears
  // its effects down without the tab closing. That is leaving the test too. React's development double-run of
  // effects re-mounts at once and cancels the timer, so only a real leave counts.
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(leaveTimer.current);
    if (!running || !enabled) return;
    return () => {
      leaveTimer.current = setTimeout(() => {
        if (live.current.policy === "NONE" || finished.current) return;
        record("TAB_HIDDEN");
        finish("TAB_HIDDEN", true);
      }, 0);
    };
  }, [running, enabled, finish, record]);

  // Submitted (by any route): the lock lifts and fullscreen ends.
  useEffect(() => {
    if (enabled) return;
    finished.current = true;
    exitFullscreen();
  }, [enabled]);

  return { running: running && enabled, start, warning: enabled ? warning : null, resume, needsFullscreen, events: () => [...eventList()], warningsUsed: () => warningsUsed.current };
}
