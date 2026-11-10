"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { answerAndNext } from "@/app/actions/cards";
import { ActivityTracker } from "@/components/activity-tracker";
import { Button, PageHeader, cx } from "@/components/ui";
import { intervalLabel, RATING_LABEL, type Rating, type Schedule } from "@/lib/anki";

type Card = { id: string; front: string; back: string; noteType: string; schedule: Schedule };
type Counts = { new: number; learn: number; due: number };

/** Styling for cards made from passages; imported decks bring their own CSS from Anki. */
const CHUNK_CSS = `
.card { font-family: Charter, Georgia, serif; font-size: 22px; line-height: 1.5; text-align: center; color: #0f1419; }
.cloze { font-weight: 700; color: #3390ec; }
.chunk { font-family: system-ui, sans-serif; font-weight: 600; font-size: 20px; margin-top: 8px; }
.meaning { font-family: system-ui, sans-serif; font-size: 17px; color: #0f1419; margin-top: 6px; }
.uz { font-family: system-ui, sans-serif; font-size: 16px; color: #6b7378; margin-top: 4px; }
hr { border: 0; border-top: 1px solid #e4e6e9; margin: 16px 0; }`;

const BASE_CSS = `
html, body { margin: 0; padding: 0; background: transparent; }
body { padding: 8px 4px; }
img { max-width: 100%; height: auto; }
.card { font-family: system-ui, sans-serif; font-size: 20px; text-align: center; color: #0f1419; }
.cloze { font-weight: 700; color: #3390ec; }
audio { margin: 6px auto; display: block; }`;

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
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${css}</style></head><body><div class="card">${html}</div></body></html>`}
    />
  );
}

export function StudySession({
  deck,
  first,
  counts: initialCounts,
  answer,
  backHref = "/student/flashcards",
  track = true,
}: {
  deck: { id: string; name: string; css: Record<string, string> };
  first: Card | null;
  counts: Counts;
  /** offline mode grades on the laptop; online it is the server action */
  answer?: (card: Card, rating: Rating) => Promise<{ card: Card | null; counts: Counts }>;
  backHref?: string;
  track?: boolean;
}) {
  const [card, setCard] = useState(first);
  const [counts, setCounts] = useState(initialCounts);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const [pending, start] = useTransition();

  const rate = useCallback(
    (rating: Rating) => {
      if (!card || pending) return;
      start(async () => {
        const next = answer ? await answer(card, rating) : await answerAndNext({ deckId: deck.id, cardId: card.id, rating });
        setCard(next.card as Card | null);
        setCounts(next.counts);
        setShown(false);
        setDone((n) => n + 1);
      });
    },
    [card, pending, answer, deck.id],
  );

  // Anki's keys: space or Enter shows the answer, then 1-4 rate it (space/Enter = Good).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as Rating);
      else if (shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        rate(3);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, rate]);

  const css = card ? (card.noteType === "chunk" ? CHUNK_CSS : (deck.css[card.noteType] ?? "")) : "";
  const now = new Date();

  return (
    <>
      {track && <ActivityTracker activity="REVIEW" />}
      <PageHeader
        title={deck.name}
        subtitle={
          <span className="tabular-nums">
            <span className="text-accent">{counts.new}</span> new · <span className="text-bad">{counts.learn}</span> learning ·{" "}
            <span className="text-good">{counts.due}</span> due{done > 0 && ` · ${done} studied`}
          </span>
        }
        action={<Link href={backHref} className="text-sm">Decks</Link>}
      />
      {!card ? (
        <div className="mx-auto max-w-xl rounded-xl bg-surface p-8 text-center shadow-bubble">
          <p className="font-semibold">Congratulations! You have finished this deck for now.</p>
          <p className="mt-1 text-muted">{done ? `${done} card${done === 1 ? "" : "s"} studied. ` : ""}Come back later for cards that are due again.</p>
          <Link href={backHref} className="mt-4 inline-block">Back to decks</Link>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-surface px-6 py-6 shadow-bubble">
            <CardFrame key={`${card.id}-${shown}`} html={shown ? card.back : card.front} css={css} />
          </div>
          <div className="mt-4 flex justify-center gap-2">
            {!shown ? (
              <Button className="min-w-48" onClick={() => setShown(true)}>Show answer</Button>
            ) : (
              ([1, 2, 3, 4] as Rating[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={pending}
                  onClick={() => rate(r)}
                  className={cx(
                    "min-w-24 rounded-md px-3 py-2 text-center font-medium text-white transition-opacity disabled:opacity-50",
                    r === 1 ? "bg-bad" : r === 2 ? "bg-[#8e99a4]" : r === 3 ? "bg-good" : "bg-accent",
                  )}
                >
                  <span className="block text-xs font-normal opacity-90">{intervalLabel(card.schedule, r, now)}</span>
                  {RATING_LABEL[r]}
                </button>
              ))
            )}
          </div>
          <p className="mt-3 text-center text-xs text-muted">{shown ? "Keys: 1 Again · 2 Hard · 3 Good · 4 Easy" : "Space shows the answer"}</p>
        </div>
      )}
    </>
  );
}
