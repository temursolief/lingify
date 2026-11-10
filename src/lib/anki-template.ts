/**
 * Renders Anki card templates the way Anki does for the common cases: {{Field}}, {{FrontSide}}, conditional sections
 * ({{#Field}}…{{/Field}}, {{^Field}}…{{/Field}}), the text:, hint: and cloze: filters, and cloze deletions
 * ({{c1::answer::hint}}). Typing answers ({{type:…}}) and text-to-speech are left out.
 */

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
const nonEmpty = (s: string | undefined) => !!s && stripHtml(s).length > 0;

const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

function renderCloze(field: string, ord: number, side: "front" | "back") {
  return field.replace(CLOZE, (_m, n: string, answer: string, hint?: string) => {
    if (Number(n) !== ord) return answer;
    if (side === "back") return `<span class="cloze">${answer}</span>`;
    return `<span class="cloze">[${hint ? hint : "..."}]</span>`;
  });
}

function hasCloze(fields: Record<string, string>, ord: number) {
  return Object.values(fields).some((f) => [...f.matchAll(CLOZE)].some((m) => Number(m[1]) === ord));
}

function render(template: string, fields: Record<string, string>, ord: number | null, side: "front" | "back", frontSide = ""): string {
  // Sections first, innermost outward, so nested sections work.
  let out = template;
  const section = /\{\{([#^])([^}]+)\}\}([\s\S]*?)\{\{\/\2\}\}/;
  for (let guard = 0; guard < 50 && section.test(out); guard++) {
    out = out.replace(section, (_m, kind: string, name: string, body: string) => {
      const filled = nonEmpty(fields[name.trim()]);
      return (kind === "#" ? filled : !filled) ? body : "";
    });
  }
  return out.replace(/\{\{([^#^/][^}]*)\}\}/g, (_m, tag: string) => {
    const parts = tag.trim().split(":");
    const name = parts.pop()!.trim();
    const filters = parts.map((p) => p.trim());
    if (name === "FrontSide") return frontSide;
    if (filters.includes("type") || filters.some((f) => f.startsWith("tts"))) return "";
    let value = fields[name] ?? "";
    if (filters.includes("cloze") && ord !== null) value = renderCloze(value, ord, side);
    if (filters.includes("text")) value = stripHtml(value);
    return value;
  });
}

/** Returns null when Anki would not create this card (an empty front, or a cloze number that does not exist). */
export function renderCard(qfmt: string, afmt: string, fields: Record<string, string>, clozeOrd: number | null) {
  if (clozeOrd !== null && !hasCloze(fields, clozeOrd)) return null;
  const front = sanitizeHtml(render(qfmt, fields, clozeOrd, "front"));
  if (!nonEmpty(front) && !/<img|\[sound:/i.test(front)) return null;
  const back = sanitizeHtml(render(afmt, fields, clozeOrd, "back", front));
  return { front, back };
}

/** Deck files come from teachers, but cards are still shown to students: no scripts, event handlers or javascript: links. */
export function sanitizeHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<(iframe|object|embed|link|meta|base)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2");
}

/** Points images and [sound:…] tags at the deck's stored media. */
export function linkMedia(html: string, deckId: string) {
  const url = (name: string) => `/api/media/${deckId}/${encodeURIComponent(name)}`;
  return html
    .replace(/(<img[^>]*\ssrc\s*=\s*)(["'])(?!https?:|data:|\/)([^"']+)\2/gi, (_m, pre: string, q: string, name: string) => `${pre}${q}${url(decodeURIComponent(name))}${q}`)
    .replace(/\[sound:([^\]]+)\]/g, (_m, name: string) => `<audio controls preload="none" src="${url(name)}"></audio>`);
}
