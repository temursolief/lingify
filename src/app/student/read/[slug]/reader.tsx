"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent, type MouseEvent } from "react";
import { completeReading, lookupWord, startReading } from "@/app/actions/reading";
import { ActivityTracker, flushActivity } from "@/components/activity-tracker";
import { Badge, Button, cx } from "@/components/ui";
import type { DictionaryData } from "@/lib/dictionary";
import type { Token } from "@/lib/texts";

type ReaderText = { id: string; slug: string; title: string; genre: string; wordCount: number; paragraphs: Token[][] };
type Popover = { token: Token; top: number; left: number; data?: DictionaryData | null; loading: boolean };

const FONT_SIZES = ["text-lg", "text-xl", "text-2xl"] as const;
const FONT_KEY = "lingify:reader-font";
const FONT_EVENT = "lingify:reader-font";

function readFontSize() {
  try {
    const saved = Number(localStorage.getItem(FONT_KEY));
    return saved >= 0 && saved < FONT_SIZES.length ? saved : 0;
  } catch {
    return 0;
  }
}

function subscribeFontSize(onChange: () => void) {
  window.addEventListener(FONT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(FONT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function speak(word: string, audio?: string) {
  if (audio) {
    new Audio(audio).play().catch(() => speak(word));
    return;
  }
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-GB";
    window.speechSynthesis.speak(u);
  }
}

export function Reader({ text, coverage, pleasure, learningLemmas }: { text: ReaderText; coverage: number; pleasure: boolean; learningLemmas: string[] }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fontSize = useSyncExternalStore(subscribeFontSize, readFontSize, () => 0);
  const [highlight, setHighlight] = useState(true);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [lookedUp, setLookedUp] = useState<Set<string>>(new Set());
  const [finishing, startFinishing] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const learning = new Set([...learningLemmas, ...lookedUp]);

  useEffect(() => {
    let cancelled = false;
    startReading(text.id)
      .then((r) => !cancelled && setSessionId(r.sessionId))
      .catch(() => !cancelled && setError("We couldn't start this reading session. Please reload the page."));
    return () => {
      cancelled = true;
    };
  }, [text.id]);

  useEffect(() => {
    if (!popover) return;
    const close = (e: Event) => {
      if (e instanceof globalThis.KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && (e.target as HTMLElement).closest("[data-popover], [data-word]")) return;
      setPopover(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [popover]);

  const changeFont = (delta: number) => {
    const next = Math.max(0, Math.min(FONT_SIZES.length - 1, fontSize + delta));
    try {
      localStorage.setItem(FONT_KEY, String(next));
    } catch {}
    window.dispatchEvent(new Event(FONT_EVENT));
  };

  const openWord = (token: Token, el: HTMLElement) => {
    if (!sessionId || !token.l || !containerRef.current) return;
    const box = el.getBoundingClientRect();
    const parent = containerRef.current.getBoundingClientRect();
    const width = Math.min(320, parent.width);
    const left = Math.max(0, Math.min(box.left - parent.left, parent.width - width));
    setPopover({ token, top: box.bottom - parent.top + 6, left, loading: true });
    setLookedUp((s) => new Set(s).add(token.l!));
    lookupWord({ sessionId, lemma: token.l, word: token.v, sentenceIndex: token.i })
      .then((data) => setPopover((p) => (p && p.token === token ? { ...p, data, loading: false } : p)))
      .catch(() => setPopover((p) => (p && p.token === token ? { ...p, data: null, loading: false } : p)));
  };

  const onWordKey = (e: KeyboardEvent<HTMLSpanElement>, token: Token) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openWord(token, e.currentTarget);
    }
  };

  const finish = () =>
    startFinishing(async () => {
      if (!sessionId) return;
      await flushActivity();
      await completeReading(sessionId);
      router.push(`/student/read/${text.slug}/practice?session=${sessionId}`);
    });

  return (
    <div className="mx-auto max-w-3xl">
      {sessionId && <ActivityTracker activity="READING" sessionId={sessionId} />}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{text.genre}</Badge>
          <Badge tone={pleasure ? "good" : "accent"}>{pleasure ? "Pleasure read" : "Study read"}</Badge>
          <span className="text-sm text-muted">You know {Math.round(coverage * 100)}% of the words</span>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <label className="mr-2 flex cursor-pointer items-center gap-1.5 text-muted">
            <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} className="accent-[var(--accent)]" />
            Show my learning words
          </label>
          <Button variant="ghost" aria-label="Smaller text" onClick={() => changeFont(-1)} disabled={fontSize === 0}>A−</Button>
          <Button variant="ghost" aria-label="Larger text" onClick={() => changeFont(1)} disabled={fontSize === FONT_SIZES.length - 1}>A+</Button>
        </div>
      </div>

      <h1 className="font-serif text-3xl font-semibold leading-tight sm:text-4xl">{text.title}</h1>
      <p className="mt-2 text-sm text-muted">
        {text.wordCount} words · Tap any word to see its meaning. It will be added to your review words.
      </p>
      {error && <p className="mt-4 rounded-lg bg-bad-soft p-3 text-sm text-bad">{error}</p>}

      <div ref={containerRef} className={cx("relative mt-8 space-y-5 font-serif leading-relaxed", FONT_SIZES[fontSize])}>
        {text.paragraphs.map((para, p) => (
          <p key={p}>
            {para.map((token, i) => {
              if (!token.l) return <span key={i}>{token.s}{token.v}</span>;
              const isLearning = highlight && learning.has(token.l);
              return (
                <span key={i}>
                  {token.s}
                  <span
                    data-word
                    role="button"
                    tabIndex={0}
                    aria-label={`Look up ${token.v}`}
                    onClick={(e: MouseEvent<HTMLSpanElement>) => openWord(token, e.currentTarget)}
                    onKeyDown={(e) => onWordKey(e, token)}
                    className={cx(
                      "cursor-pointer rounded-sm transition-colors hover:bg-accent-soft",
                      isLearning && "bg-learning/70 decoration-dotted",
                      popover?.token === token && "bg-accent-soft",
                    )}
                  >
                    {token.v}
                  </span>
                </span>
              );
            })}
          </p>
        ))}

        {popover && (
          <div
            data-popover
            role="dialog"
            aria-label={`Meaning of ${popover.token.v}`}
            className="absolute z-10 w-80 max-w-full rounded-xl border border-line bg-surface p-4 font-sans text-base shadow-lg"
            style={{ top: popover.top, left: popover.left }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold">{popover.token.l}</p>
                {popover.data?.phonetic && <p className="text-sm text-muted">{popover.data.phonetic}</p>}
              </div>
              <div className="flex gap-1">
                <Button variant="secondary" className="px-2 py-1" aria-label="Hear pronunciation" onClick={() => speak(popover.token.l!, popover.data?.audio)}>
                  🔊
                </Button>
                <Button variant="ghost" className="px-2 py-1" aria-label="Close" onClick={() => setPopover(null)}>✕</Button>
              </div>
            </div>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto text-sm">
              {popover.loading && <p className="text-muted">Looking up…</p>}
              {!popover.loading && !popover.data && <p className="text-muted">No definition found. Try guessing from the sentence.</p>}
              {popover.data?.meanings.map((m) => (
                <div key={m.partOfSpeech}>
                  <span className="text-xs font-medium uppercase tracking-wide text-accent">{m.partOfSpeech}</span>
                  <p>{m.definition}</p>
                  {m.example && <p className="text-muted italic">“{m.example}”</p>}
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-line pt-2 text-xs text-muted">Added to your review words.</p>
          </div>
        )}
      </div>

      <div className="mt-12 flex flex-col items-center gap-2 border-t border-line pt-8">
        <Button onClick={finish} disabled={!sessionId || finishing} className="px-6 py-3 text-base">
          {finishing ? "Saving…" : "I've finished reading"}
        </Button>
        <p className="text-sm text-muted">{pleasure ? "Exercises are optional for pleasure reads." : "Next: a few short questions about the text."}</p>
      </div>
    </div>
  );
}
