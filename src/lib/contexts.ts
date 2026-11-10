export type WordContext = { sentence: string; word: string; textId: string };

/** How many different sentences we keep per word; reviewing in varied contexts builds a flexible memory of it. */
export const MAX_CONTEXTS = 6;

export function addContext(existing: unknown, ctx: WordContext): WordContext[] {
  const list = Array.isArray(existing) ? (existing as WordContext[]) : [];
  if (!ctx.sentence || list.some((c) => c.sentence === ctx.sentence)) return list;
  return [...list, ctx].slice(-MAX_CONTEXTS);
}

/** Each review uses the next sentence in turn, so the student cannot just remember one sentence. */
export function pickContext(state: { contexts: unknown; contextSentence: string | null; contextWord: string | null; lemma: string; srsReviews: number }) {
  const list = Array.isArray(state.contexts) ? (state.contexts as WordContext[]) : [];
  if (list.length) return list[state.srsReviews % list.length];
  return { sentence: state.contextSentence ?? "", word: state.contextWord ?? state.lemma, textId: "" };
}

/** A word becomes known through reading alone after this many encounters spread over at least this many texts. */
export const INCIDENTAL_ENCOUNTERS = 10;
export const INCIDENTAL_TEXTS = 3;
