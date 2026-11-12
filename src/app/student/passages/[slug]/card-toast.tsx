"use client";

import { useEffect, useState } from "react";
import { deleteOwnCard } from "@/app/actions/cards";

export type Toast = { id: string; chunk: string; meaning: string; uz: string | null; pending?: boolean } | { error: string };

/** "Flashcard added", with its meaning once found, and Undo. */
export function CardToast({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [undone, setUndone] = useState(false);
  useEffect(() => {
    const t = setTimeout(onClose, 9000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div role="status" className="fixed inset-x-4 bottom-16 z-30 rounded-xl bg-ink p-4 text-sm text-white shadow-lg md:left-auto md:right-6 md:w-80">
      {"error" in toast ? (
        <p>{toast.error}</p>
      ) : undone ? (
        <p>Card removed.</p>
      ) : (
        <>
          <p className="font-medium">Flashcard added to your flashcards for this passage</p>
          <p className="mt-1">
            <b>{toast.chunk}</b>
            {toast.meaning ? ` — ${toast.meaning}` : toast.pending && <span className="text-white/60"> — finding a simple meaning…</span>}
          </p>
          {toast.uz && <p className="text-white/70">O‘zbekcha: {toast.uz}</p>}
          <button
            type="button"
            className="mt-2 text-[#8cc4ff] hover:underline"
            onClick={() => {
              deleteOwnCard(toast.id);
              setUndone(true);
            }}
          >
            Undo
          </button>
        </>
      )}
    </div>
  );
}
