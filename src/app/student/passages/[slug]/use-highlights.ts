"use client";

import { useEffect, useState, type RefObject } from "react";
import type { Evidence } from "@/lib/passages";

/** Room kept for the highlight toolbar ("Make flashcard" + "Proof for question 12"). */
const TOOLBAR_WIDTH = 290;

export type Selection = { top: number; left: number; evidence: Evidence };

/** Character offset of a DOM point inside a paragraph element (question-number badges are CSS-only, so they don't count). */
function offsetIn(root: HTMLElement, node: Node, offset: number) {
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

/**
 * Highlighting in the passage: the selected words as evidence (paragraph, offsets, text) and where to put the small
 * toolbar (make a flashcard, or use the sentence as proof). A selection across paragraphs does not count.
 */
export function useHighlights(paragraphs: string[], passageRef: RefObject<HTMLDivElement | null>) {
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    const read = () => {
      const sel = window.getSelection();
      const host = passageRef.current;
      if (!sel || sel.isCollapsed || !sel.rangeCount || !host) return setSelection(null);
      const range = sel.getRangeAt(0);
      const para = (range.startContainer.parentElement?.closest("[data-para]") ?? null) as HTMLElement | null;
      const endPara = (range.endContainer.parentElement?.closest("[data-para]") ?? null) as HTMLElement | null;
      if (!para || para !== endPara) return setSelection(null);
      const index = Number(para.dataset.para);
      const start = offsetIn(para, range.startContainer, range.startOffset);
      const end = offsetIn(para, range.endContainer, range.endOffset);
      const text = paragraphs[index].slice(start, end);
      if (!text.trim()) return setSelection(null);
      const box = range.getBoundingClientRect();
      const frame = host.getBoundingClientRect();
      // Kept inside the pane: on a phone a selection near the right edge would push the toolbar off the screen.
      const left = Math.max(8, Math.min(box.left - frame.left, host.clientWidth - TOOLBAR_WIDTH - 8));
      setSelection({ top: box.bottom - frame.top + host.scrollTop + 6, left, evidence: { paragraph: index, start, end, text } });
    };
    // A mouse ends a selection with mouseup. A finger does not: the handles are dragged, so the selection is read
    // once it has stopped changing.
    let touch = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    const onPointer = (e: PointerEvent) => {
      touch = e.pointerType !== "mouse";
    };
    const onChange = () => {
      if (!touch) return;
      clearTimeout(wait);
      wait = setTimeout(read, 350);
    };
    document.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("mouseup", read);
    document.addEventListener("selectionchange", onChange);
    return () => {
      clearTimeout(wait);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("mouseup", read);
      document.removeEventListener("selectionchange", onChange);
    };
  }, [paragraphs, passageRef]);

  const clear = () => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  return { selection, clear };
}
