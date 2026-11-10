"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadStudyQueue } from "@/app/actions/cards";
import { loadQueue, queueSize } from "@/lib/offline-store";
import { recordReview, sendQueue, syncNow } from "@/lib/offline-sync";
import type { StudyQueue } from "@/lib/study";
import { StudySession, type Answered } from "./study-session";

/**
 * Studying with a connection. The session runs in the browser, so the next card shows the moment a button is
 * pressed. Each answer is kept on the device and sent in the background; if the connection drops it goes later.
 */
export function OnlineStudy({ deck, queue, startedAt }: { deck: { id: string; name: string; css: Record<string, string> }; queue: StudyQueue; startedAt: string }) {
  const router = useRouter();
  const studied = useRef(false);
  const [session, setSession] = useState({ queue, startedAt });
  const [unsent, setUnsent] = useState(false);

  // Answers from an earlier session may still be waiting on this device (a lost connection, a closed tab). The
  // server did not know them when it built this queue, so send them and start from what it knows afterwards.
  useEffect(() => {
    let alive = true;
    (async () => {
      const waiting = await loadQueue().catch(() => null);
      if (!waiting || !queueSize(waiting) || !(await sendQueue())) return;
      const next = await loadStudyQueue(deck.id).catch(() => null);
      if (alive && next && !studied.current) setSession({ queue: next, startedAt: new Date().toISOString() });
    })();
    return () => {
      alive = false;
    };
  }, [deck.id]);

  const onAnswer = useCallback((a: Answered) => {
    studied.current = true;
    void recordReview({ cardId: a.cardId, rating: a.rating, at: a.at.toISOString() }).then((sent) => setUnsent(!sent));
  }, []);

  /** Out of cards: make sure the server has every answer, then ask it what is left for today. */
  const refill = useCallback(async () => {
    if (!(await sendQueue())) return "unsent" as const;
    return loadStudyQueue(deck.id).catch(() => "unsent" as const);
  }, [deck.id]);

  // Leaving the deck: send what is left, then refresh the offline copy and the numbers in the sidebar.
  useEffect(
    () => () => {
      if (!studied.current) return;
      studied.current = false;
      void syncNow().then(() => router.refresh());
    },
    [router],
  );

  return (
    <StudySession
      key={session.startedAt}
      deck={deck}
      queue={session.queue}
      startedAt={session.startedAt}
      onAnswer={onAnswer}
      refill={refill}
      note={unsent ? "No connection. Your answers are saved on this device and sent when it is back." : undefined}
    />
  );
}
