"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityTracker } from "@/components/activity-tracker";
import { Button, PageHeader, cx } from "@/components/ui";
import { intervalLabel, RATING_LABEL, type Rating } from "@/lib/anki";
import { applyAnswer, nextCard, queueCounts, type LiveCard, type StudyQueue } from "@/lib/study";

/**
 * One answer, as the session hands it to whoever saves it. `durationMs`: from the card's front appearing to the rating,
 * capped at a minute, so a teacher can tell real study from clicking through.
 */
export type Answered = { cardId: string; rating: Rating; at: Date; durationMs: number };
/** What `refill` resolves with: a new queue, or "unsent" when the server could not be reached. */
export type Refill = StudyQueue | "unsent" | null;

/** Styling for cards made from passages; imported decks bring their own CSS from Anki. */
const CHUNK_CSS = `
.card { font-family: Charter, Georgia, serif; font-size: 22px; line-height: 1.5; text-align: left; color: #e9e9ed; }
.cloze { font-weight: 600; color: #b5abfc; }
.chunk { font-family: Inter, system-ui, sans-serif; font-weight: 500; font-size: 28px; margin-top: 8px; letter-spacing: -0.01em; }
.meaning { font-family: Inter, system-ui, sans-serif; font-size: 17px; color: #e9e9ed; margin-top: 6px; }
.uz { font-family: Inter, system-ui, sans-serif; font-size: 14px; color: #d2cefd; margin-top: 6px; }
hr { border: 0; border-top: 1px solid rgba(233,233,237,0.14); margin: 16px 0; }`;

const BASE_CSS = `
html, body { margin: 0; padding: 0; background: transparent; }
body { padding: 8px 4px; }
img { max-width: 100%; height: auto; }
.card { font-family: Inter, system-ui, sans-serif; font-size: 20px; text-align: center; color: #e9e9ed; }
.cloze { font-weight: 600; color: #b5abfc; }
a { color: #b5abfc; }
audio { margin: 6px auto; display: block; color-scheme: dark; }`;

/** Imported Anki decks often paint black text on white: on the dark card that would vanish, so the ground and ink win. */
const DARK_OVERRIDE = `
html, body, .card { background: transparent !important; color: #e9e9ed !important; }
.nightMode, .night_mode { background: transparent !important; }`;

/** A card face in a sandboxed frame: the deck's own CSS applies, and no script inside a card can run. */
function CardFrame({ html, css }: { html: string; css: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const fit = () => {
    const doc = ref.current?.contentDocument;
    if (doc) setHeight(Math.max(80, doc.documentElement.scrollHeight));
  };
  return (
    <iframe
      ref={ref}
      title="Card"
      sandbox="allow-same-origin"
      onLoad={() => {
        fit();
        ref.current?.contentDocument?.querySelectorAll("img").forEach((img) => img.addEventListener("load", fit));
      }}
      className="w-full border-0"
      style={{ height }}
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${css}${DARK_OVERRIDE}</style></head><body><div class="card">${html}</div></body></html>`}
    />
  );
}

type Step = { queue: StudyQueue; card: LiveCard | null; at: number; studied: number };

const RATINGS: Rating[] = [1, 2, 3, 4];

/**
 * A study session, run entirely in the browser: the queue holds every card that can come up today, each answer is
 * scheduled here with the Anki code the server uses, and the next card shows at once. Saving an answer is the
 * caller's job (`onAnswer`): online it is sent in the background, offline it waits on the device.
 */
export function StudySession({
  deck,
  queue,
  startedAt,
  onAnswer,
  refill,
  note,
  backHref = "/student/flashcards",
  track = true,
}: {
  deck: { id: string; name: string; css: Record<string, string> };
  queue: StudyQueue;
  /** when the queue was built (ISO); the first card is picked for this moment, the same on server and browser */
  startedAt: string;
  /** called after every answer with the answer and the queue as it is now */
  onAnswer: (answered: Answered, queue: StudyQueue) => void;
  /** asks for the reviews that did not fit in the first queue (`moreDue`) */
  refill?: () => Promise<Refill>;
  /** a line under the card, such as "no connection, answers are saved on this device" */
  note?: ReactNode;
  backHref?: string;
  track?: boolean;
}) {
  const [step, setStep] = useState<Step>(() => {
    const at = new Date(startedAt);
    return { queue, card: nextCard(queue, at), at: at.getTime(), studied: 0 };
  });
  const [shown, setShown] = useState(false);
  const [more, setMore] = useState<"none" | "loading" | "failed">("none");
  // When the current card's front appeared and when its back was revealed (shown → flipped → rated).
  const timing = useRef<{ cardId: string | null; shownAt: number; flippedAt: number | null }>({ cardId: null, shownAt: 0, flippedAt: null });
  const currentId = step.card?.id ?? null;
  useEffect(() => {
    timing.current = { cardId: currentId, shownAt: Date.now(), flippedAt: null };
  }, [currentId, step.studied]);
  const reveal = useCallback(() => {
    timing.current.flippedAt ??= Date.now();
    setShown(true);
  }, []);

  const loadMore = useCallback(() => {
    if (!refill) return;
    setMore("loading");
    refill().then(
      (next) => {
        if (!next || next === "unsent") return setMore("failed");
        const at = new Date();
        setStep((s) => ({ queue: next, card: nextCard(next, at), at: at.getTime(), studied: s.studied }));
        setMore("none");
      },
      () => setMore("failed"),
    );
  }, [refill]);

  const rate = useCallback(
    (rating: Rating) => {
      const { card } = step;
      if (!card) return;
      const now = new Date();
      const ratedAt = now.getTime();
      const durationMs = timing.current.cardId === card.id ? Math.max(0, Math.min(ratedAt - timing.current.shownAt, 60_000)) : 0;
      const next = applyAnswer(step.queue, card.id, rating, now);
      const upcoming = nextCard(next, now);
      setStep({ queue: next, card: upcoming, at: now.getTime(), studied: step.studied + 1 });
      setShown(false);
      onAnswer({ cardId: card.id, rating, at: now, durationMs }, next);
      if (!upcoming && next.moreDue) loadMore();
    },
    [step, onAnswer, loadMore],
  );

  // Anki's keys: space or Enter shows the answer, then 1-4 rate it (space/Enter = Good).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A held key must not answer the next card too.
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest("input, textarea, select, a, [contenteditable]")) return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        reveal();
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as Rating);
      else if (shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        rate(3);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, rate, reveal]);

  const { card, studied } = step;
  const at = new Date(step.at);
  const counts = queueCounts(step.queue, at);
  const css = card ? (card.noteType === "chunk" ? CHUNK_CSS : (deck.css[card.noteType] ?? "")) : "";
  const waitingForMore = !card && !!step.queue.moreDue && !!refill;

  return (
    <>
      {track && <ActivityTracker activity="REVIEW" />}
      <PageHeader
        title={deck.name}
        subtitle={
          <span className="tabular-nums">
            <span className="text-accent">{counts.new}</span> new · <span className="text-bad">{counts.learn}</span> learning ·{" "}
            <span className="text-good">{counts.due}</span> due{studied > 0 && ` · ${studied} studied`}
          </span>
        }
        action={<Link href={backHref} className="text-sm">Decks</Link>}
      />
      {card ? (
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-surface px-4 py-5 shadow-lifted sm:px-7 sm:py-7">
            <CardFrame key={`${card.id}-${shown}`} html={shown ? card.back : card.front} css={css} />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {!shown ? (
              <Button className="col-span-4 min-h-12" onClick={reveal}>Show answer</Button>
            ) : (
              RATINGS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => rate(r)}
                  className={cx(
                    "flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-md border border-line px-1 py-2 text-center text-ink transition-colors hover:border-accent active:bg-accent-soft",
                    r === 1 && "hover:border-bad",
                  )}
                >
                  <span className="text-sm font-medium">{RATING_LABEL[r]}</span>
                  <span className="text-[11px] text-muted">{intervalLabel(card.schedule, r, at)}</span>
                </button>
              ))
            )}
          </div>
          <p className="mt-3 hidden text-center text-xs text-muted sm:block">{shown ? "Keys: 1 Again · 2 Hard · 3 Good · 4 Easy" : "Space shows the answer"}</p>
          {note && <p className="mt-3 text-center text-xs text-muted">{note}</p>}
        </div>
      ) : waitingForMore ? (
        <div className="mx-auto max-w-xl rounded-xl bg-surface p-8 text-center shadow-bubble">
          {more === "failed" ? (
            <>
              <p className="font-semibold">More cards are due today</p>
              <p className="mt-1 text-muted">They could not be loaded: there is no connection. Your answers are saved on this device.</p>
              <Button className="mt-4" onClick={loadMore}>Try again</Button>
            </>
          ) : (
            <p className="text-muted">Loading more cards…</p>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-xl rounded-xl bg-surface p-8 text-center shadow-bubble">
          <p className="font-semibold">Congratulations! You have finished this deck for now.</p>
          <p className="mt-1 text-muted">{studied ? `${studied} card${studied === 1 ? "" : "s"} studied. ` : ""}Come back later for cards that are due again.</p>
          {note && <p className="mt-3 text-xs text-muted">{note}</p>}
          <Link href={backHref} className="mt-4 inline-block">Back to decks</Link>
        </div>
      )}
    </>
  );
}
