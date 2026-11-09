import type { Mark, Token } from "./texts";

/** Finds every place `target` appears in the text, aligned to whole tokens, ignoring case. */
export function findMarks(paragraphs: Token[][], target: string): Mark[] {
  const needle = target.toLowerCase().replace(/[’]/g, "'");
  const marks: Mark[] = [];
  paragraphs.forEach((tokens, p) => {
    let text = "";
    const starts: number[] = [];
    const ends: number[] = [];
    tokens.forEach((t, i) => {
      if (i > 0) text += t.s;
      starts.push(text.length);
      text += t.v;
      ends.push(text.length);
    });
    const hay = text.toLowerCase().replace(/[’]/g, "'");
    let at = hay.indexOf(needle);
    while (at !== -1) {
      const from = starts.indexOf(at);
      const to = ends.indexOf(at + needle.length);
      if (from !== -1 && to !== -1) marks.push({ p, from, to });
      at = hay.indexOf(needle, at + 1);
    }
  });
  return marks;
}
