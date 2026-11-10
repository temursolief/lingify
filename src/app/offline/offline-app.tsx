"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { ReviewSession } from "@/app/student/review/review-session";
import { Avatar } from "@/components/nav-links";
import { Button, Card, PageHeader, cx } from "@/components/ui";
import { enqueue, loadPack, loadQueue, queueSize, savePack, loadEtag } from "@/lib/offline-store";
import { syncNow } from "@/lib/offline-sync";
import type { OfflineCard, OfflinePack, OfflineText } from "@/lib/offline-types";
import { isCorrect, resultFor, reviewOutcome } from "@/lib/review-grade";
import type { Token } from "@/lib/texts";

const AVATAR = ["#65aadd", "#e17076", "#7bc862", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774"];

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

const dueNow = (cards: OfflineCard[]) => cards.filter((c) => Date.parse(c.dueAt) <= Date.now());

export function OfflineApp() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [pack, setPack] = useState<OfflinePack | null | undefined>(undefined);
  const [waiting, setWaiting] = useState(0);
  const [open, setOpen] = useState<string>("review");
  // The cards of the current review round stay fixed while the student works through them,
  // even if a background sync replaces the saved copy.
  const [round, setRound] = useState<{ id: number; cards: OfflineCard[] } | null>(null);

  const refresh = useCallback(async () => {
    const [p, q] = await Promise.all([loadPack().catch(() => undefined), loadQueue().catch(() => null)]);
    setPack(p ?? null);
    setWaiting(q ? queueSize(q) : 0);
    if (p) setRound((r) => r ?? { id: 1, cards: dueNow(p.review.cards) });
  }, []);

  const newRound = async () => {
    const p = await loadPack();
    if (p) setRound((r) => ({ id: (r?.id ?? 0) + 1, cards: dueNow(p.review.cards) }));
  };

  useEffect(() => {
    // Reading IndexedDB is the external system this effect syncs with.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Whether the last attempt reached the server: the laptop can be "online" while the internet or server is not.
  const [reachable, setReachable] = useState(false);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    const attempt = () =>
      syncNow().then((r) => {
        if (!alive) return;
        setReachable(r.ok);
        refresh();
      });
    attempt();
    const timer = setInterval(attempt, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [online, refresh]);

  const persist = async (next: OfflinePack) => {
    setPack(next);
    await savePack(next, (await loadEtag()) ?? null);
  };

  if (pack === undefined) return null;

  if (pack === null) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-md py-8 text-center">
          <p className="font-medium">Nothing is saved on this laptop yet</p>
          <p className="mt-1 text-muted">Open Lingify once with internet. Your next texts and review words will be saved here automatically.</p>
          {online && <a href="/student" className="mt-4 inline-block font-medium">Open Lingify</a>}
        </Card>
      </div>
    );
  }

  const due = dueNow(pack.review.cards);
  const text = pack.texts.find((t) => t.id === open);

  return (
    <div className="grid h-dvh grid-cols-[clamp(240px,28vw,320px)_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 flex-col border-r border-line bg-bar">
        <div className="flex h-14 shrink-0 items-center gap-2 px-5">
          <span className="text-lg font-semibold">Lingify</span>
          <span className="text-sm text-muted">offline</span>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          <Row
            active={open === "review"}
            label="Review"
            subtitle={due.length ? `${due.length} word${due.length === 1 ? "" : "s"} waiting for you` : "Nothing to review now"}
            badge={due.length}
            color={AVATAR[0]}
            onClick={() => {
              if (open !== "review") newRound();
              setOpen("review");
            }}
          />
          {pack.texts.map((t, i) => (
            <Row
              key={t.id}
              active={open === t.id}
              label={t.title}
              subtitle={t.assigned ? "From your teacher" : t.genre}
              color={AVATAR[(i + 1) % AVATAR.length]}
              onClick={() => setOpen(t.id)}
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
          {open === "review" || !text ? (
            <>
              <PageHeader title="Review" subtitle="Saved on this laptop · works without internet" />
              {round?.cards.length ? (
                <ReviewSession
                  key={round.id}
                  cards={round.cards}
                  mode={pack.review.mode}
                  track={false}
                  submit={async ({ lemma, answer }) => {
                    const card = round.cards.find((c) => c.lemma === lemma)!;
                    const now = new Date();
                    const correct = isCorrect(answer, card.answer, lemma);
                    const outcome = reviewOutcome(card.state, correct, now);
                    await enqueue((q) => q.reviews.push({ lemma, answer, at: now.toISOString() }));
                    setWaiting((n) => n + 1);
                    // Keep the card's new schedule locally so it only comes back when it is due again.
                    const updated: OfflineCard = {
                      ...card,
                      streak: outcome.srsStreak,
                      dueAt: (outcome.srsDue ?? new Date(now.getTime() + 365 * 86_400_000)).toISOString(),
                      state: { ...outcome, status: outcome.graduated ? "KNOWN" : outcome.forgotten ? "LEARNING" : card.state.status },
                    };
                    const latest = (await loadPack()) ?? pack;
                    await persist({ ...latest, review: { ...latest.review, cards: latest.review.cards.map((c) => (c.lemma === lemma ? updated : c)) } });
                    // With a connection, send it straight away; offline it waits in the queue.
                    if (navigator.onLine) syncNow().then((r) => { setReachable(r.ok); refresh(); });
                    return resultFor(outcome, correct, card.answer, now);
                  }}
                  doneActions={pack.texts[0] && <Button onClick={() => { refresh(); setOpen(pack.texts[0].id); }}>Read a text</Button>}
                />
              ) : (
                <Card className="mx-auto max-w-xl py-8 text-center">
                  <p className="font-medium">Nothing to review right now</p>
                  <p className="mt-1 text-muted">Read one of your saved texts instead.</p>
                </Card>
              )}
            </>
          ) : (
            <OfflineReader
              key={text.id}
              text={text}
              uzbek={pack.uzbek}
              onFinished={async () => {
                await enqueue((q) => q.finished.push({ textId: text.id, at: new Date().toISOString() }));
                const latest = (await loadPack()) ?? pack;
                await persist({ ...latest, texts: latest.texts.filter((t) => t.id !== text.id) });
                setWaiting((n) => n + 1);
                await newRound();
                setOpen("review");
              }}
            />
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

type Popover = { token: Token; key: string; top: number; left: number };

/** The reader without internet: click a word for its saved meaning; the lookup syncs later and adds it to Review. */
function OfflineReader({ text, uzbek, onFinished }: { text: OfflineText; uzbek: boolean; onFinished: () => Promise<void> }) {
  const [popover, setPopover] = useState<Popover | null>(null);
  const [looked, setLooked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const learning = useMemo(() => new Set([...text.learning, ...looked]), [text.learning, looked]);
  const phraseAt = useMemo(() => {
    const map = new Map<string, number>();
    text.phrases.forEach((p, index) => {
      for (const m of p.marks) for (let i = m.from; i <= m.to; i++) if (!map.has(`${m.p}:${i}`)) map.set(`${m.p}:${i}`, index);
    });
    return map;
  }, [text.phrases]);

  useEffect(() => {
    if (!popover) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
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

  const openWord = (token: Token, key: string, el: HTMLElement) => {
    if (!token.l || !box.current) return;
    const r = el.getBoundingClientRect();
    const parent = box.current.getBoundingClientRect();
    setPopover({ token, key, top: r.bottom - parent.top + 6, left: Math.max(0, Math.min(r.left - parent.left, parent.width - 320)) });
    const lemma = token.l;
    if (text.glosses[lemma] && !looked.has(lemma)) {
      setLooked((s) => new Set(s).add(lemma));
      enqueue((q) => q.lookups.push({ textId: text.id, lemma, word: token.v, sentenceIndex: token.i, at: new Date().toISOString() })).catch(() => undefined);
    }
  };

  const gloss = popover?.token.l ? text.glosses[popover.token.l] : undefined;
  const phrase = popover ? text.phrases[phraseAt.get(popover.key) ?? -1] : undefined;

  return (
    <>
      <PageHeader title={text.title} subtitle={`${text.genre} · saved on this laptop`} />
      <Card className="mx-auto max-w-3xl px-8 py-7">
        <p className="mb-4 text-sm text-muted">Click a word if you need its meaning. It will be added to your review words when you&apos;re back online.</p>
        <div ref={box} className="relative space-y-5 font-serif text-lg leading-relaxed">
          {text.paragraphs.map((para, p) => (
            <p key={p}>
              {para.map((token, i) => {
                const key = `${p}:${i}`;
                if (!token.l) return <span key={i}>{token.s}{token.v}</span>;
                return (
                  <span key={i}>
                    {token.s}
                    <span
                      data-word
                      role="button"
                      tabIndex={0}
                      onClick={(e: MouseEvent<HTMLSpanElement>) => openWord(token, key, e.currentTarget)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openWord(token, key, e.currentTarget))}
                      className={cx(
                        "cursor-pointer rounded-sm hover:bg-accent-soft",
                        learning.has(token.l) && "bg-learning",
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
              className="absolute z-10 w-80 max-w-full rounded-xl bg-surface p-4 font-sans text-[15px] shadow-lg ring-1 ring-line"
              style={{ top: popover.top, left: popover.left }}
            >
              <p className="font-semibold">{popover.token.l}</p>
              {gloss ? (
                <>
                  <p className="text-sm text-muted">{gloss.pos}</p>
                  <p className="mt-1">{gloss.definition}</p>
                  {uzbek && gloss.uz && <p className="mt-1 text-muted">O‘zbekcha: {gloss.uz}</p>}
                </>
              ) : (
                <p className="mt-1 text-muted">You already know this word, or no meaning is saved for it.</p>
              )}
              {phrase && (
                <div className="mt-3 border-t border-line pt-2">
                  <p className="text-sm text-muted">Part of the phrase</p>
                  <p className="font-medium">{phrase.phrase}</p>
                  <p>{phrase.meaning}</p>
                  {uzbek && phrase.uz && <p className="text-muted">O‘zbekcha: {phrase.uz}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
      <div className="mt-6 text-center">
        <Button disabled={busy} onClick={() => { setBusy(true); onFinished().finally(() => setBusy(false)); }}>I&apos;ve finished reading</Button>
        <p className="mt-2 text-sm text-muted">It counts as read once you&apos;re back online.</p>
      </div>
    </>
  );
}
