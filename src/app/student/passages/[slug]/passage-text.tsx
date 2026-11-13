"use client";

import { memo, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { paragraphLetter } from "@/lib/passage-format";
import type { Evidence, QuestionState } from "@/lib/passages";

/** The passage itself. Typing an answer does not touch it, so it is not drawn again for every letter. */
export const PassageText = memo(function PassageText({ paragraphs, proofs, stateOf }: { paragraphs: string[]; proofs: Record<number, Evidence>; stateOf: Map<number, QuestionState> }) {
  return (
    <article className="space-y-5 font-serif text-[1.0625rem] leading-relaxed">
      {paragraphs.map((text, i) => (
        <div key={i} className="flex gap-2 md:gap-3">
          <span className="w-4 shrink-0 pt-0.5 font-sans text-sm font-semibold text-muted select-none">{paragraphLetter(i)}</span>
          <p data-para={i} className="min-w-0 flex-1">
            <Marked text={text} marks={Object.entries(proofs).filter(([, e]) => e.paragraph === i).map(([n, e]) => ({ n: Number(n), start: e.start, end: e.end, state: stateOf.get(Number(n)) }))} />
          </p>
        </div>
      ))}
    </article>
  );
});

/** Paragraph text with proof highlights; each mark carries its question number as a CSS badge. */
function Marked({ text, marks }: { text: string; marks: { n: number; start: number; end: number; state?: QuestionState }[] }) {
  if (!marks.length) return <>{text}</>;
  const cuts = [...new Set([0, text.length, ...marks.flatMap((m) => [m.start, m.end])])].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    const covering = marks.filter((m) => m.start <= a && m.end >= b);
    const piece = text.slice(a, b);
    if (!covering.length) out.push(piece);
    else {
      const first = covering.find((m) => m.start === a);
      const st = covering[0].state;
      out.push(
        <mark
          key={i}
          data-n={first ? first.n : undefined}
          className={cx(
            "rounded-sm px-0.5 text-ink",
            st?.correct ? "bg-good-soft" : st && !st.correct ? "bg-warn-soft" : "bg-learning",
            first && "before:mr-1 before:rounded before:bg-[var(--color-accent-700)] before:px-1 before:font-sans before:text-[11px] before:text-[var(--color-accent-100)] before:content-[attr(data-n)]",
          )}
        >
          {piece}
        </mark>,
      );
    }
  }
  return <>{out}</>;
}

