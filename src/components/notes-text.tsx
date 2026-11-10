import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * IELTS-style notes: one line each, "## " starts a heading, "* " a bullet, and {{number}} marks a gap,
 * which the caller renders (an input on the student's screen).
 */
export function NotesText({ title, text, gap }: { title?: string; text: string; gap: (n: number) => ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg bg-paper p-4 leading-loose">
      {title && <p className="mb-1 text-center font-semibold">{title}</p>}
      {text.split("\n").map((line, li) => {
        const heading = line.startsWith("## ");
        const bullet = line.startsWith("* ");
        const body = line.replace(/^(## |\* )/, "");
        if (!body.trim()) return null;
        const parts = body.split(/(\{\{\d+\}\})/).map((part, i) => {
          const m = part.match(/^\{\{(\d+)\}\}$/);
          return m ? <span key={i}>{gap(Number(m[1]))}</span> : <span key={i}>{part}</span>;
        });
        if (heading) return <p key={li} className="pt-2 font-semibold">{parts}</p>;
        return <p key={li} className={cx(bullet && "relative pl-5 before:absolute before:left-1 before:content-['•']")}>{parts}</p>;
      })}
    </div>
  );
}
