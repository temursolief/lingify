"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { StudySession, type Answered } from "@/app/student/flashcards/[deckId]/study-session";
import { Avatar } from "@/components/avatar";
import { ShellFrame } from "@/components/shell-frame";
import { Card, PageHeader, cx } from "@/components/ui";
import { loadEtag, loadPack, loadQueue, queueSize, savePack, updateQueue } from "@/lib/offline-store";
import { syncNow } from "@/lib/offline-sync";
import type { OfflinePack } from "@/lib/offline-types";
import { paragraphLetter } from "@/lib/passage-format";
import { queueCounts, type StudyQueue } from "@/lib/study";

const AVATAR = ["#65aadd", "#e17076", "#7bc862", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774"];

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * Lingify with no internet: the saved flashcard decks (graded on the device with the same Anki scheduler as the
 * server, answers queued for syncing) and the saved passages to read.
 */
export function OfflineApp() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [pack, setPack] = useState<OfflinePack | null | undefined>(undefined);
  const [waiting, setWaiting] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  // The times are set when the saved copy has been read, not while rendering: this page is built once, ahead of time.
  const [round, setRound] = useState({ n: 0, startedAt: "" });
  const [reachable, setReachable] = useState(false);
  /** The moment the numbers in the list are counted for; moved on by every answer. */
  const [clock, setClock] = useState(0);
  /** Answers are written one after another, so a slow write never overtakes the next one. */
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  const refresh = useCallback(async () => {
    const [p, q] = await Promise.all([loadPack().catch(() => undefined), loadQueue().catch(() => null)]);
    const now = new Date();
    setClock(now.getTime());
    setRound((r) => (r.startedAt ? r : { ...r, startedAt: now.toISOString() }));
    setPack(p ?? null);
    setWaiting(q ? queueSize(q) : 0);
  }, []);

  useEffect(() => {
    // Reading IndexedDB is the external system this effect syncs with.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    const attempt = () =>
      syncNow().then((r) => {
        if (!alive) return;
        setReachable(r.ok);
        setWaiting(r.waiting);
      });
    attempt();
    const timer = setInterval(attempt, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [online]);

  if (pack === undefined) return null;
  if (pack === null) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-md py-8 text-center">
          <p className="font-medium">Nothing is saved on this device yet</p>
          <p className="mt-1 text-muted">Open Lingify once with internet. Your flashcards and passages will be saved here automatically.</p>
          {online && <a href="/student" className="mt-4 inline-block font-medium">Open Lingify</a>}
        </Card>
      </div>
    );
  }

  const current = open ?? pack.decks[0]?.id ?? pack.passages[0]?.id ?? null;
  const deck = pack.decks.find((d) => d.id === current);
  const passage = pack.passages.find((p) => p.id === current);

  /** Keeps one answer on the device: first in the queue to send, then in the saved copy of the deck. */
  const saveAnswer = (deckId: string, a: Answered, queue: StudyQueue) => {
    setPack((p) => p && { ...p, decks: p.decks.map((d) => (d.id === deckId ? { ...d, cards: queue.cards, newLeft: queue.newLeft, reviewsLeft: queue.reviewsLeft } : d)) });
    setWaiting((n) => n + 1);
    setClock(a.at.getTime());
    writes.current = writes.current
      .then(async () => {
        await updateQueue((q) => ({ ...q, reviews: [...q.reviews, { cardId: a.cardId, rating: a.rating, at: a.at.toISOString(), durationMs: a.durationMs }] }));
        const latest = (await loadPack()) ?? pack;
        const next = { ...latest, decks: latest.decks.map((d) => (d.id === deckId ? { ...d, cards: queue.cards, newLeft: queue.newLeft, reviewsLeft: queue.reviewsLeft } : d)) };
        await savePack(next, (await loadEtag()) ?? null);
        if (!navigator.onLine) return;
        const r = await syncNow();
        setReachable(r.ok);
        setWaiting(r.waiting);
      })
      .catch(() => {});
  };

  const openRow = (id: string, restart = false) => {
    setOpen(id);
    setClock(new Date().getTime());
    if (restart) setRound((r) => ({ n: r.n + 1, startedAt: new Date().toISOString() }));
  };

  const nav = (
    <nav className="space-y-0.5 px-2">
      {pack.decks.map((d, i) => {
        const c = queueCounts(d, new Date(clock));
        return (
          <Row
            key={d.id}
            active={current === d.id}
            label={d.name}
            subtitle={`${c.new} new · ${c.learn + c.due} due`}
            badge={c.learn + c.due}
            color={AVATAR[i % AVATAR.length]}
            onClick={() => openRow(d.id, true)}
          />
        );
      })}
      {pack.passages.length > 0 && <p className="px-3 pt-3 pb-1 text-xs font-medium text-muted">Passages to read</p>}
      {pack.passages.map((p, i) => (
        <Row
          key={p.id}
          active={current === p.id}
          label={p.title}
          subtitle="From your teacher"
          color={AVATAR[(i + 3) % AVATAR.length]}
          onClick={() => openRow(p.id)}
        />
      ))}
    </nav>
  );

  const status = (
    <p className="px-3 py-1 text-xs text-muted">
      {online && reachable ? (
        <>Connected{waiting ? ", sending your answers…" : "."} <a href="/student" className="font-medium">Open full Lingify</a></>
      ) : waiting ? (
        <>No connection. {waiting} answer{waiting === 1 ? "" : "s"} saved on this device, sent automatically when the connection is back.</>
      ) : (
        <>No connection. Your work is saved on this device and sent automatically later.</>
      )}
    </p>
  );

  return (
    <ShellFrame brand={<>Lingify <span className="text-sm font-normal text-muted">offline</span></>} nav={nav} footer={status}>
      {deck ? (
        <StudySession
          key={`${deck.id}-${round.n}`}
          deck={{ id: deck.id, name: deck.name, css: deck.css }}
          queue={deck}
          startedAt={round.startedAt}
          onAnswer={(a, queue) => saveAnswer(deck.id, a, queue)}
          backHref="/offline"
          track={false}
        />
      ) : passage ? (
        <>
          <PageHeader title={passage.title} subtitle="Saved on this device · the questions need a connection" />
          <article className="mx-auto max-w-3xl space-y-5 rounded-xl bg-surface px-4 py-5 font-serif text-[1.0625rem] leading-relaxed shadow-bubble sm:px-8 sm:py-7">
            {passage.paragraphs.map((text, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-4 shrink-0 pt-0.5 font-sans text-sm font-semibold text-muted">{paragraphLetter(i)}</span>
                <p className="flex-1">{text}</p>
              </div>
            ))}
          </article>
        </>
      ) : (
        <Card className="mx-auto max-w-xl py-8 text-center text-muted">Nothing saved yet.</Card>
      )}
    </ShellFrame>
  );
}

function Row({ active, label, subtitle, badge, color, onClick }: { active: boolean; label: string; subtitle: string; badge?: number; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-close-menu
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors", active ? "bg-accent-soft text-[var(--color-accent-200)]" : "hover:bg-hover")}
    >
      <Avatar label={label} color={color} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        <span className={cx("block truncate text-sm", active ? "text-soft" : "text-muted")}>{subtitle}</span>
      </span>
      {!!badge && (
        <span className={cx("min-w-6 rounded-full px-1.5 text-center text-[13px] leading-6 font-medium", "bg-accent text-page")}>{badge}</span>
      )}
    </button>
  );
}
