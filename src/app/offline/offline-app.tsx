"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { StudySession } from "@/app/student/flashcards/[deckId]/study-session";
import { Avatar } from "@/components/nav-links";
import { Card, PageHeader, cx } from "@/components/ui";
import { answer, deckCounts, pickNext, type Rating } from "@/lib/anki";
import { enqueue, loadEtag, loadPack, loadQueue, queueSize, savePack } from "@/lib/offline-store";
import { syncNow } from "@/lib/offline-sync";
import { revive, store, type OfflineDeck, type OfflinePack } from "@/lib/offline-types";
import { paragraphLetter } from "@/lib/passage-format";

const AVATAR = ["#65aadd", "#e17076", "#7bc862", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774"];

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

const liveDeck = (d: OfflineDeck) => d.cards.map((c) => ({ ...c, schedule: revive(c.schedule) }));
const countsOf = (d: OfflineDeck, now = new Date()) => deckCounts(liveDeck(d).map((c) => c.schedule), now, d.newLeft, d.reviewsLeft);

/**
 * Lingify with no internet: the saved flashcard decks (graded on the laptop with the same Anki scheduler as the
 * server, answers queued for syncing) and the saved passages to read.
 */
export function OfflineApp() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [pack, setPack] = useState<OfflinePack | null | undefined>(undefined);
  const [waiting, setWaiting] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [reachable, setReachable] = useState(false);

  const refresh = useCallback(async () => {
    const [p, q] = await Promise.all([loadPack().catch(() => undefined), loadQueue().catch(() => null)]);
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
          <p className="font-medium">Nothing is saved on this laptop yet</p>
          <p className="mt-1 text-muted">Open Lingify once with internet. Your flashcards and passages will be saved here automatically.</p>
          {online && <a href="/student" className="mt-4 inline-block font-medium">Open Lingify</a>}
        </Card>
      </div>
    );
  }

  const current = open ?? pack.decks[0]?.id ?? pack.passages[0]?.id ?? null;
  const deck = pack.decks.find((d) => d.id === current);
  const passage = pack.passages.find((p) => p.id === current);

  const answerOffline = async (deckId: string, cardId: string, rating: Rating) => {
    const now = new Date();
    const latest = (await loadPack()) ?? pack;
    const d = latest.decks.find((x) => x.id === deckId)!;
    const before = revive(d.cards.find((c) => c.id === cardId)!.schedule);
    const next = answer(before, rating, now);
    const updated: OfflineDeck = {
      ...d,
      newLeft: before.queue === "NEW" ? Math.max(0, d.newLeft - 1) : d.newLeft,
      reviewsLeft: before.queue === "REVIEW" ? Math.max(0, d.reviewsLeft - 1) : d.reviewsLeft,
      cards: d.cards.map((c) => (c.id === cardId ? { ...c, schedule: store(next) } : c)),
    };
    const nextPack = { ...latest, decks: latest.decks.map((x) => (x.id === deckId ? updated : x)) };
    await savePack(nextPack, (await loadEtag()) ?? null);
    await enqueue((q) => q.reviews.push({ cardId, rating, at: now.toISOString() }));
    setPack(nextPack);
    setWaiting((n) => n + 1);
    if (navigator.onLine) syncNow().then((r) => setReachable(r.ok));
    return { card: pickNext(liveDeck(updated), now, updated.newLeft, updated.reviewsLeft), counts: countsOf(updated, now) };
  };

  return (
    <div className="grid h-dvh grid-cols-[clamp(240px,28vw,320px)_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 flex-col border-r border-line bg-bar">
        <div className="flex h-14 shrink-0 items-center gap-2 px-5">
          <span className="text-lg font-semibold">Lingify</span>
          <span className="text-sm text-muted">offline</span>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {pack.decks.map((d, i) => {
            const c = countsOf(d);
            return (
              <Row
                key={d.id}
                active={current === d.id}
                label={d.name}
                subtitle={`${c.new} new · ${c.learn + c.due} due`}
                badge={c.learn + c.due}
                color={AVATAR[i % AVATAR.length]}
                onClick={() => {
                  setOpen(d.id);
                  setRound((r) => r + 1);
                }}
              />
            );
          })}
          {pack.passages.length > 0 && <p className="px-3 pt-3 pb-1 text-xs font-medium text-muted">Passages to read</p>}
          {pack.passages.map((p, i) => (
            <Row
              key={p.id}
              active={current === p.id}
              label={p.title}
              subtitle={p.assigned ? "From your teacher" : "Practice passage"}
              color={AVATAR[(i + 3) % AVATAR.length]}
              onClick={() => setOpen(p.id)}
            />
          ))}
        </nav>
        <div className="shrink-0 border-t border-line px-5 py-3 text-xs text-muted">
          {online && reachable ? (
            <>Connected{waiting ? ", sending your answers…" : "."} <a href="/student" className="font-medium">Open full Lingify</a></>
          ) : waiting ? (
            <>No connection. {waiting} answer{waiting === 1 ? "" : "s"} saved on this laptop, sent automatically when the connection is back.</>
          ) : (
            <>No connection. Your work is saved on this laptop and sent automatically later.</>
          )}
        </div>
      </aside>

      <main className="min-h-0 overflow-y-auto">
        <div className="px-6 pt-6 pb-12">
          {deck ? (
            <StudySession
              key={`${deck.id}-${round}`}
              deck={{ id: deck.id, name: deck.name, css: deck.css }}
              first={pickNext(liveDeck(deck), new Date(), deck.newLeft, deck.reviewsLeft)}
              counts={countsOf(deck)}
              answer={(card, rating) => answerOffline(deck.id, card.id, rating)}
              backHref="/offline"
              track={false}
            />
          ) : passage ? (
            <>
              <PageHeader title={passage.title} subtitle="Saved on this laptop · the questions need a connection" />
              <article className="mx-auto max-w-3xl space-y-5 rounded-xl bg-surface px-8 py-7 font-serif text-[1.0625rem] leading-relaxed shadow-bubble">
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
        </div>
      </main>
    </div>
  );
}

function Row({ active, label, subtitle, badge, color, onClick }: { active: boolean; label: string; subtitle: string; badge?: number; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors", active ? "bg-accent text-white" : "hover:bg-hover")}
    >
      <Avatar label={label} color={color} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        <span className={cx("block truncate text-sm", active ? "text-white/80" : "text-muted")}>{subtitle}</span>
      </span>
      {!!badge && (
        <span className={cx("min-w-6 rounded-full px-1.5 text-center text-[13px] leading-6 font-medium", active ? "bg-white text-accent" : "bg-accent text-white")}>{badge}</span>
      )}
    </button>
  );
}
