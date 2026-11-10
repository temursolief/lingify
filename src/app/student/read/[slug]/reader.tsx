"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent, type MouseEvent } from "react";
import {
  abandonReading,
  addPreTaught,
  answerItem,
  savePhrase,
  completeReading,
  dictionaryFor,
  guessWord,
  lookupWord,
  savePrediction,
  startReading,
  type LookupResult,
} from "@/app/actions/reading";
import { ActivityTracker, flushActivity } from "@/components/activity-tracker";
import { ChoiceQuestion, feedbackLine } from "@/components/choice-question";
import { setUzbekGlosses } from "@/app/actions/student";
import { Button, Card, PageHeader, cx } from "@/components/ui";
import { phraseQuestion } from "@/lib/lesson";
import type { DictionaryData } from "@/lib/dictionary";
import type { Mark, Token } from "@/lib/texts";

type ReaderText = { id: string; slug: string; title: string; genre: string; wordCount: number; paragraphs: Token[][] };
type Choice = { question: string; options: string[] };
type Lesson = {
  leadIn: string;
  prediction: Choice | null;
  preTeach: { word: string; lemma: string; definition: string; ccq: Choice }[];
  gist: string | null;
  phrases: { phrase: string; meaning: string; uz?: string; marks: Mark[] }[];
  grammar: { structure: string; marks: Mark[] }[];
};
type Popover = {
  token: Token;
  top: number;
  left: number;
  phase: "loading" | "guess" | "result";
  result?: LookupResult;
  guess?: { choice: number | null; correct: boolean; answer: number };
  dictionary?: DictionaryData | null | "loading";
  /** set when the tapped word belongs to a useful phrase: the phrase is taught instead of the single word */
  chunk?: { index: number; phase: "guess" | "result"; feedback?: { correct: boolean; answer: number }; saved: boolean };
};

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

function markIndex(marks: Mark[]) {
  const set = new Set<string>();
  for (const m of marks) for (let i = m.from; i <= m.to; i++) set.add(`${m.p}:${i}`);
  return set;
}

type Props = {
  text: ReaderText;
  coverage: number;
  pleasure: boolean;
  learningLemmas: string[];
  readBefore: boolean;
  series: { title: string; part: number; total: number } | null;
  lesson: Lesson;
  uzbek: boolean;
};

export function Reader({ text, coverage, pleasure, learningLemmas, readBefore, series, lesson, uzbek }: Props) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasBefore = !!lesson.leadIn || !!lesson.prediction || lesson.preTeach.length > 0;
  const [stage, setStage] = useState<"before" | "reading">(readBefore || !hasBefore ? "reading" : "before");

  useEffect(() => {
    let cancelled = false;
    startReading(text.id)
      .then((r) => !cancelled && setSessionId(r.sessionId))
      .catch(() => !cancelled && setError("We couldn't start this reading session. Please reload the page."));
    return () => {
      cancelled = true;
    };
  }, [text.id]);

  return (
    <>
      {sessionId && <ActivityTracker activity="READING" sessionId={sessionId} />}
      <PageHeader
        title={text.title}
        subtitle={`${text.genre}${series ? ` · ${series.title}, part ${series.part} of ${series.total}` : ""} · you know ${Math.round(coverage * 100)}% of the words${pleasure ? " · easy read" : ""}`}
      />
      <div className="mx-auto max-w-3xl">
      {error && <p className="mb-4 rounded-xl bg-bad-soft p-3 text-sm text-bad">{error}</p>}

      {stage === "before" ? (
        <BeforeReading lesson={lesson} sessionId={sessionId} optional={pleasure} onDone={() => setStage("reading")} />
      ) : (
        <ReadingView
          text={text}
          sessionId={sessionId}
          pleasure={pleasure}
          learningLemmas={learningLemmas}
          lesson={lesson}
          uzbek={uzbek}
          onFinish={async () => {
            if (!sessionId) return;
            await flushActivity();
            await completeReading(sessionId);
            router.push(`/student/read/${text.slug}/practice?session=${sessionId}`);
          }}
          onStop={async (reason) => {
            if (!sessionId) return;
            await flushActivity();
            await abandonReading({ sessionId, reason });
            router.push("/student/library?stopped=1");
          }}
        />
      )}
      </div>
    </>
  );
}

function BeforeReading({ lesson, sessionId, optional, onDone }: { lesson: Lesson; sessionId: string | null; optional: boolean; onDone: () => void }) {
  const steps = [
    lesson.leadIn && "think",
    lesson.prediction && "predict",
    lesson.preTeach.length > 0 && "words",
  ].filter(Boolean) as ("think" | "predict" | "words")[];
  const [step, setStep] = useState(0);
  const [prediction, setPrediction] = useState<number | null>(null);
  const [ccqDone, setCcqDone] = useState(0);
  const [pending, start] = useTransition();
  const current = steps[step];
  const label = { think: "Think", predict: "Predict", words: "Key words" };

  const next = () => {
    if (step + 1 < steps.length) setStep(step + 1);
    else
      start(async () => {
        if (sessionId && lesson.preTeach.length) await addPreTaught(sessionId).catch(() => undefined);
        onDone();
      });
  };

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <ol className="flex gap-2 text-sm" aria-label="Before you read">
          {steps.map((s, i) => (
            <li key={s} className={cx("py-1", i === step ? "font-bold text-ink" : i < step ? "text-good" : "text-muted")}>
              {i < step ? "✓ " : `${i + 1}. `}
              {label[s]}
            </li>
          ))}
        </ol>
        <button type="button" onClick={onDone} className="text-sm text-muted underline hover:text-ink">
          {optional ? "Skip, just read" : "Skip to the text"}
        </button>
      </div>

      {current === "think" && (
        <div>
          <p className="text-sm text-muted">Before you read</p>
          <p className="mt-2 font-serif text-2xl leading-snug">{lesson.leadIn}</p>
          <p className="mt-3 text-sm text-muted">Take a moment to think about it, or talk about it with a partner. There is no right answer.</p>
          <Button className="mt-5" onClick={next}>I&apos;ve thought about it</Button>
        </div>
      )}

      {current === "predict" && lesson.prediction && (
        <div>
          <p className="text-sm text-muted">Make a prediction</p>
          <p className="mt-2 text-lg font-medium">{lesson.prediction.question}</p>
          <div className="mt-3 space-y-2">
            {lesson.prediction.options.map((o, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={prediction === i}
                onClick={() => {
                  setPrediction(i);
                  if (sessionId) savePrediction({ sessionId, choice: i }).catch(() => undefined);
                }}
                className={cx(
                  "block w-full rounded-lg border px-4 py-3 text-left transition",
                  prediction === i ? "border-accent bg-accent text-accent-ink" : "border-line hover:bg-paper",
                )}
              >
                {o}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">Any guess is fine. You&apos;ll find out after reading.</p>
          <Button className="mt-4" onClick={next} disabled={prediction === null}>Continue</Button>
        </div>
      )}

      {current === "words" && (
        <div>
          <p className="text-sm text-muted">Words to know first</p>
          <p className="mt-1 text-sm text-muted">These words are important for the story. They&apos;ll go into your review words.</p>
          <div className="mt-4 space-y-4">
            {lesson.preTeach.map((w, i) => (
              <div key={w.word} className="rounded-lg border border-line p-4">
                <p className="text-lg font-semibold">{w.word}</p>
                <p className="text-muted">{w.definition}</p>
                <div className="mt-3">
                  <ChoiceQuestion
                    compact
                    seed={i}
                    question={<span className="text-sm text-muted">Check: {w.ccq.question}</span>}
                    options={w.ccq.options}
                    check={(choice) => answerItem({ sessionId: sessionId!, kind: "CCQ", index: i, choice })}
                    onAnswered={() => setCcqDone((n) => n + 1)}
                  />
                </div>
              </div>
            ))}
          </div>
          <Button className="mt-5" onClick={next} disabled={pending || !sessionId}>
            {ccqDone >= lesson.preTeach.length ? "Start reading" : "Start reading anyway"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ReadingView({
  text,
  sessionId,
  pleasure,
  learningLemmas,
  lesson,
  uzbek: initialUzbek,
  onFinish,
  onStop,
}: {
  text: ReaderText;
  sessionId: string | null;
  pleasure: boolean;
  learningLemmas: string[];
  lesson: Lesson;
  uzbek: boolean;
  onFinish: () => Promise<void>;
  onStop: (reason: "TOO_HARD" | "NOT_INTERESTED" | "NO_TIME") => Promise<void>;
}) {
  const fontSize = useSyncExternalStore(subscribeFontSize, readFontSize, () => 0);
  const [highlight, setHighlight] = useState(true);
  const [showPhrases, setShowPhrases] = useState(false);
  const [showGrammar, setShowGrammar] = useState(false);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [lookedUp, setLookedUp] = useState<Set<string>>(new Set());
  const [stopping, setStopping] = useState(false);
  const [uzbek, setUzbek] = useState(initialUzbek);
  const [savedChunks, setSavedChunks] = useState<Set<number>>(new Set());
  const [busy, startBusy] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const learning = new Set([...learningLemmas, ...lesson.preTeach.map((w) => w.lemma), ...lookedUp]);
  const phraseMarks = useMemo(() => markIndex(lesson.phrases.flatMap((p) => p.marks)), [lesson.phrases]);
  // Which phrase (if any) each token belongs to, so tapping a word inside a phrase teaches the whole phrase.
  const phraseAt = useMemo(() => {
    const map = new Map<string, number>();
    lesson.phrases.forEach((p, index) => {
      for (const key of markIndex(p.marks)) if (!map.has(key)) map.set(key, index);
    });
    return map;
  }, [lesson.phrases]);
  const grammarMarks = useMemo(() => markIndex(lesson.grammar.flatMap((g) => g.marks)), [lesson.grammar]);
  const sentenceTokens = useMemo(() => {
    const bySentence = new Map<number, Token[]>();
    for (const t of text.paragraphs.flat()) bySentence.set(t.i, [...(bySentence.get(t.i) ?? []), t]);
    return bySentence;
  }, [text.paragraphs]);

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

  const update = (token: Token, patch: Partial<Popover>) => setPopover((p) => (p && p.token === token ? { ...p, ...patch } : p));

  const loadDictionary = (token: Token) => {
    update(token, { dictionary: "loading" });
    dictionaryFor(token.l!)
      .then((d) => update(token, { dictionary: d }))
      .catch(() => update(token, { dictionary: null }));
  };

  const toggleUzbek = () => {
    setUzbek(!uzbek);
    setUzbekGlosses(!uzbek).catch(() => undefined);
  };

  const position = (el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    const parent = containerRef.current!.getBoundingClientRect();
    const width = Math.min(352, parent.width);
    return { top: box.bottom - parent.top + 6, left: Math.max(0, Math.min(box.left - parent.left, parent.width - width)) };
  };

  const openChunk = (token: Token, el: HTMLElement, index: number) => {
    if (!sessionId || !containerRef.current) return;
    setPopover({ token, ...position(el), phase: "result", chunk: { index, phase: savedChunks.has(index) ? "result" : "guess", saved: savedChunks.has(index) } });
  };

  const revealChunk = (token: Token, index: number, choice: number | null) => {
    if (!sessionId) return;
    const save = () =>
      savePhrase({ sessionId, index })
        .then(() => {
          setSavedChunks((s) => new Set(s).add(index));
          setPopover((p) => (p && p.token === token && p.chunk ? { ...p, chunk: { ...p.chunk, saved: true } } : p));
        })
        .catch(() => undefined);
    if (choice === null) {
      setPopover((p) => (p && p.token === token && p.chunk ? { ...p, chunk: { ...p.chunk, phase: "result" } } : p));
      save();
      return;
    }
    answerItem({ sessionId, kind: "PHRASE", index, choice })
      .then((f) => setPopover((p) => (p && p.token === token && p.chunk ? { ...p, chunk: { ...p.chunk, phase: "result", feedback: f } } : p)))
      .catch(() => undefined)
      .finally(save);
  };

  const openWord = (token: Token, el: HTMLElement, key?: string) => {
    if (!sessionId || !token.l || !containerRef.current) return;
    const chunkIndex = key ? phraseAt.get(key) : undefined;
    if (chunkIndex !== undefined) {
      openChunk(token, el, chunkIndex);
      return;
    }
    lookupAt(token, position(el));
  };

  const showWordInstead = () => {
    if (popover) lookupAt(popover.token, { top: popover.top, left: popover.left });
  };

  const chunkSentence = (token: Token, index: number) => {
    const keys = markIndex(lesson.phrases[index].marks);
    return (sentenceTokens.get(token.i) ?? []).map((t) => {
      const para = text.paragraphs.findIndex((p) => p.includes(t));
      return { text: t.v, space: t.s, bold: keys.has(`${para}:${text.paragraphs[para].indexOf(t)}`) };
    });
  };

  const lookupAt = (token: Token, pos: { top: number; left: number }) => {
    if (!sessionId || !token.l) return;
    setPopover({ token, ...pos, phase: "loading" });
    setLookedUp((s) => new Set(s).add(token.l!));
    lookupWord({ sessionId, lemma: token.l, word: token.v, sentenceIndex: token.i })
      .then((result) => {
        update(token, { result, phase: result.guess ? "guess" : "result" });
        if (!result.entry) loadDictionary(token);
      })
      .catch(() => update(token, { phase: "result", result: { entry: null, guess: null } }));
  };

  const guess = (token: Token, choice: number | null) => {
    if (choice === null || !sessionId) {
      update(token, { phase: "result" });
      return;
    }
    guessWord({ sessionId, lemma: token.l!, choice })
      .then((r) => update(token, { phase: "result", guess: { choice, ...r } }))
      .catch(() => update(token, { phase: "result" }));
  };

  const onWordKey = (e: KeyboardEvent<HTMLSpanElement>, token: Token, key: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openWord(token, e.currentTarget, key);
    }
  };

  const contextSentence = (token: Token) =>
    (sentenceTokens.get(token.i) ?? []).map((t, i) => (
      <span key={i}>
        {i ? t.s : ""}
        {t === token ? <strong className="text-accent">{t.v}</strong> : t.v}
      </span>
    ));

  return (
    <>
      {lesson.gist && (
        <div className="rounded-xl bg-accent-soft p-4 text-sm">
          <p className="font-medium text-accent">Read for the main idea</p>
          <p className="mt-1">{lesson.gist}</p>
          <p className="mt-1 text-muted">Keep going when you meet a new word: you can often guess it from the sentence. Click a word only if you need it.</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex cursor-pointer items-center gap-1.5 text-muted">
          <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} className="accent-[var(--accent)]" />
          My learning words
        </label>
        {lesson.phrases.length > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5 text-muted">
            <input type="checkbox" checked={showPhrases} onChange={(e) => setShowPhrases(e.target.checked)} className="accent-[var(--accent)]" />
            Useful phrases
          </label>
        )}
        {lesson.grammar.length > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5 text-muted">
            <input type="checkbox" checked={showGrammar} onChange={(e) => setShowGrammar(e.target.checked)} className="accent-[var(--accent)]" />
            Notice the grammar
          </label>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Button variant="ghost" aria-label="Smaller text" onClick={() => changeFont(-1)} disabled={fontSize === 0}>A−</Button>
          <Button variant="ghost" aria-label="Larger text" onClick={() => changeFont(1)} disabled={fontSize === FONT_SIZES.length - 1}>A+</Button>
        </span>
      </div>

      {showPhrases && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {lesson.phrases.map((p) => (
            <li key={p.phrase} className="rounded-lg border border-line bg-surface px-3 py-1.5">
              <span className="font-medium underline decoration-accent decoration-2 underline-offset-4">{p.phrase}</span>
              <span className="text-muted"> = {p.meaning}</span>
            </li>
          ))}
        </ul>
      )}
      {showGrammar && <p className="mt-3 text-sm text-muted">Highlighted: {lesson.grammar.map((g) => g.structure).join(" · ")}</p>}

      <div ref={containerRef} className={cx("relative mt-4 space-y-5 rounded-xl bg-surface px-8 py-7 font-serif leading-relaxed shadow-bubble", FONT_SIZES[fontSize])}>
        {text.paragraphs.map((para, p) => (
          <p key={p}>
            {para.map((token, i) => {
              const key = `${p}:${i}`;
              const inPhrase = showPhrases && phraseMarks.has(key);
              const inGrammar = showGrammar && grammarMarks.has(key);
              const decoration = cx(
                inPhrase && "underline decoration-accent decoration-2 underline-offset-4",
                inGrammar && "rounded-sm bg-accent-soft font-semibold text-accent",
              );
              if (!token.l) return <span key={i}>{token.s}<span className={decoration}>{token.v}</span></span>;
              const isLearning = highlight && learning.has(token.l);
              return (
                <span key={i}>
                  {token.s}
                  <span
                    data-word
                    role="button"
                    tabIndex={0}
                    aria-label={`Look up ${token.v}`}
                    onClick={(e: MouseEvent<HTMLSpanElement>) => openWord(token, e.currentTarget, key)}
                    onKeyDown={(e) => onWordKey(e, token, key)}
                    className={cx(
                      "cursor-pointer rounded-sm transition-colors hover:bg-accent-soft",
                      isLearning && !inGrammar && "bg-learning/70",
                      popover?.token === token && "bg-accent-soft",
                      decoration,
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
            className="absolute z-10 w-[22rem] max-w-full rounded-xl bg-surface p-4 font-sans text-base shadow-lg ring-1 ring-line"
            style={{ top: popover.top, left: popover.left }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-semibold">{popover.chunk ? lesson.phrases[popover.chunk.index].phrase : popover.token.l}</p>
              <div className="flex gap-1">
                <Button
                  variant={uzbek ? "primary" : "secondary"}
                  className="px-2 py-1 text-sm"
                  aria-pressed={uzbek}
                  title="Show Uzbek translations"
                  onClick={toggleUzbek}
                >
                  UZ
                </Button>
                <Button
                  variant="secondary"
                  className="px-2 py-1"
                  aria-label="Hear pronunciation"
                  onClick={() =>
                    speak(
                      popover.chunk ? lesson.phrases[popover.chunk.index].phrase : popover.token.l!,
                      !popover.chunk && popover.dictionary && popover.dictionary !== "loading" ? popover.dictionary.audio : undefined,
                    )
                  }
                >
                  🔊
                </Button>
                <Button variant="ghost" className="px-2 py-1" aria-label="Close" onClick={() => setPopover(null)}>✕</Button>
              </div>
            </div>

            {popover.chunk && (
              <ChunkView
                phrase={lesson.phrases[popover.chunk.index]}
                question={phraseQuestion(lesson.phrases, popover.chunk.index)}
                word={popover.token.v}
                sentence={chunkSentence(popover.token, popover.chunk.index)}
                state={popover.chunk}
                uzbek={uzbek}
                onAnswer={(choice) => revealChunk(popover.token, popover.chunk!.index, choice)}
                onShowWord={showWordInstead}
              />
            )}

            {!popover.chunk && popover.phase === "loading" && <p className="mt-2 text-sm text-muted">One moment…</p>}

            {!popover.chunk && popover.phase === "guess" && popover.result?.guess && (
              <div className="mt-2 text-sm">
                <p className="font-serif text-base italic text-muted">{contextSentence(popover.token)}</p>
                <p className="mt-3 font-medium">What do you think it means here?</p>
                <div className="mt-2 space-y-1.5">
                  {popover.result.guess.map((option, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => guess(popover.token, i)}
                      className="block w-full rounded-lg border border-line px-3 py-2 text-left hover:bg-paper"
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => guess(popover.token, null)} className="mt-2 text-muted underline hover:text-ink">
                  I don&apos;t know, show me
                </button>
              </div>
            )}

            {!popover.chunk && popover.phase === "result" && (
              <div className="mt-2 space-y-2 text-sm">
                {popover.guess && (
                  <p className={cx("font-medium", popover.guess.correct ? "text-good" : "text-warn")}>
                    {popover.guess.correct ? "Great guess! You worked it out from the sentence." : feedbackLine(false)}
                  </p>
                )}
                {popover.result?.entry && (
                  <div>
                    <span className="text-sm text-muted">{popover.result.entry.pos}</span>
                    <p className="text-base">{popover.result.entry.definition}</p>
                    {uzbek && popover.result.entry.uz && <p className="text-muted">O‘zbekcha: {popover.result.entry.uz}</p>}
                  </div>
                )}
                {popover.dictionary === "loading" && <p className="text-muted">Looking up…</p>}
                {popover.dictionary === null && !popover.result?.entry && (
                  <p className="text-muted">No definition found. Try guessing from the sentence.</p>
                )}
                {popover.dictionary && popover.dictionary !== "loading" && (
                  <div className="max-h-40 space-y-2 overflow-y-auto border-t border-line pt-2">
                    {popover.dictionary.phonetic && <p className="text-muted">{popover.dictionary.phonetic}</p>}
                    {popover.dictionary.meanings.map((m) => (
                      <div key={m.partOfSpeech}>
                        <span className="text-sm text-muted">{m.partOfSpeech}</span>
                        <p>{m.definition}</p>
                        {m.example && <p className="text-muted italic">“{m.example}”</p>}
                      </div>
                    ))}
                  </div>
                )}
                {popover.result?.entry && popover.dictionary === undefined && (
                  <button type="button" onClick={() => loadDictionary(popover.token)} className="text-muted underline hover:text-ink">
                    More meanings and pronunciation
                  </button>
                )}
                <p className="border-t border-line pt-2 text-xs text-muted">Added to your review words.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button onClick={() => startBusy(onFinish)} disabled={!sessionId || busy} className="px-6 py-3 text-base">
          {busy ? "Saving…" : "I've finished reading"}
        </Button>
        <p className="text-sm text-muted">{pleasure ? "Exercises are optional for pleasure reads." : "Next: check the main idea, then a few short tasks."}</p>
        {!stopping ? (
          <button type="button" onClick={() => setStopping(true)} className="text-sm text-muted underline hover:text-ink">
            Stop reading this text
          </button>
        ) : (
          <div className="w-full max-w-md rounded-xl bg-surface p-4 text-center text-sm shadow-bubble">
            <p className="font-medium">That&apos;s fine. Good readers stop books they don&apos;t enjoy.</p>
            <p className="mt-1 text-muted">Why are you stopping? This helps us suggest better texts.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {([["NOT_INTERESTED", "Not interesting for me"], ["TOO_HARD", "Too hard"], ["NO_TIME", "No time now"]] as const).map(([reason, label]) => (
                <Button key={reason} variant="secondary" disabled={busy} onClick={() => startBusy(() => onStop(reason))}>
                  {label}
                </Button>
              ))}
            </div>
            <button type="button" onClick={() => setStopping(false)} className="mt-3 text-muted underline">Keep reading</button>
          </div>
        )}
      </div>
    </>
  );
}

function ChunkView({ phrase, question, word, sentence, state, uzbek, onAnswer, onShowWord }: {
  phrase: { phrase: string; meaning: string; uz?: string };
  question: { options: string[] };
  word: string;
  sentence: { text: string; space: string; bold: boolean }[];
  state: NonNullable<Popover["chunk"]>;
  uzbek: boolean;
  onAnswer: (choice: number | null) => void;
  onShowWord: () => void;
}) {
  return (
    <div className="mt-2 text-sm">
      <p className="text-muted">“{word}” is part of a useful phrase. Learn the words together.</p>
      <p className="mt-2 text-base italic text-muted">
        {sentence.map((t, i) => (
          <span key={i}>
            {i ? t.space : ""}
            {t.bold ? <strong className="text-accent">{t.text}</strong> : t.text}
          </span>
        ))}
      </p>
      {state.phase === "guess" ? (
        <>
          <p className="mt-3 font-medium">What does “{phrase.phrase}” mean here?</p>
          <div className="mt-2 space-y-1.5">
            {question.options.map((option, i) => (
              <button key={i} type="button" onClick={() => onAnswer(i)} className="block w-full rounded-md border border-line px-3 py-2 text-left hover:bg-paper">
                {option}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onAnswer(null)} className="mt-2 text-muted underline hover:text-ink">
            I don&apos;t know, show me
          </button>
        </>
      ) : (
        <div className="mt-3 space-y-2">
          {state.feedback && (
            <p className={cx("font-medium", state.feedback.correct ? "text-good" : "text-warn")}>
              {state.feedback.correct ? "Great guess! You worked it out from the sentence." : feedbackLine(false)}
            </p>
          )}
          <p className="text-base">{phrase.meaning}</p>
          {uzbek && phrase.uz && <p className="text-muted">O‘zbekcha: {phrase.uz}</p>}
          <p className="border-t border-line pt-2 text-xs text-muted">{state.saved ? "Saved to your review as a phrase." : "Saving to your review…"}</p>
        </div>
      )}
      <button type="button" onClick={onShowWord} className="mt-2 block text-muted underline hover:text-ink">
        Show only the word “{word}”
      </button>
    </div>
  );
}
