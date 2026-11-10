import "server-only";
import { pickContext } from "./contexts";
import { db } from "./db";
import type { DictionaryData } from "./dictionary";
import { lemmaRanks } from "./frequency";
import { glossaryEntry } from "./glossary";
import type { Phrase } from "./texts";
import { dueWhere } from "./vocab";

export type ReviewCard = {
  lemma: string;
  /** the sentence where the student met the word, with the word replaced by a blank */
  gapped: string | null;
  hint: string | null;
  firstLetter: string;
  length: number;
  options: string[] | null;
  exposures: number;
  streak: number;
  isPhrase: boolean;
  /** a word already learned, back for a spaced check-up */
  checkup: boolean;
  /** how many different sentences this item has been met in */
  contexts: number;
};

const SESSION_SIZE = 20;
const RECENT_ATTEMPTS = 20;
const MIN_ATTEMPTS_FOR_TYPING = 10;
/** Above this recent accuracy, cards switch to typed recall so success stays around 85–90% (desirable difficulty). */
const TYPING_THRESHOLD = 0.9;

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export async function reviewQueue(userId: string) {
  const now = new Date();
  const [due, recent, totalDue] = await Promise.all([
    db.lemmaState.findMany({
      where: dueWhere(userId, now),
      orderBy: { srsDue: "asc" },
      take: SESSION_SIZE,
    }),
    db.exerciseAttempt.findMany({ where: { userId, kind: "REVIEW" }, orderBy: { answeredAt: "desc" }, take: RECENT_ATTEMPTS }),
    db.lemmaState.count({ where: dueWhere(userId, now) }),
  ]);

  const accuracy = recent.length ? recent.filter((a) => a.correct).length / recent.length : 0;
  const mode: "typed" | "choice" = recent.length >= MIN_ATTEMPTS_FOR_TYPING && accuracy >= TYPING_THRESHOLD ? "typed" : "choice";

  const [entries, phraseTexts] = await Promise.all([
    db.dictionaryEntry.findMany({ where: { word: { in: due.map((d) => d.lemma) }, found: true } }),
    due.some((d) => d.isPhrase) ? db.text.findMany({ select: { phrases: true } }) : Promise.resolve([]),
  ]);
  const allPhrases = [...new Set(phraseTexts.flatMap((t) => (t.phrases as Phrase[]).map((p) => p.inText.toLowerCase())))];
  const definitions = new Map(entries.map((e) => [e.word, (e.data as DictionaryData).meanings[0]?.definition ?? null]));

  const cards: ReviewCard[] = due.map((d) => {
    const ctx = pickContext(d);
    const answer = ctx.word;
    const gapped = ctx.sentence ? ctx.sentence.replace(new RegExp(`\\b${escape(answer)}\\b`), "_____") : null;
    let options: string[] | null = null;
    if (mode === "choice") {
      const others = due.filter((o) => o.lemma !== d.lemma && o.isPhrase === d.isPhrase).map((o) => pickContext(o).word.toLowerCase());
      const fillers = d.isPhrase
        ? allPhrases
        : lemmaRanks
            .slice(800, 3000)
            .filter(([l, , plain]) => plain === 1 && Math.abs(l.length - answer.length) <= 2)
            .map(([l]) => l);
      const pool = [...new Set([...others, ...fillers])].filter((w) => w !== answer.toLowerCase());
      const picks = pool.sort((a, b) => hash(d.lemma + a) - hash(d.lemma + b)).slice(0, 3);
      options = [answer.toLowerCase(), ...picks].sort((a, b) => hash(a + d.lemma) - hash(b + d.lemma));
    }
    return {
      lemma: d.lemma,
      gapped: gapped && gapped !== ctx.sentence ? gapped : null,
      hint: d.isPhrase ? d.meaning : (glossaryEntry(d.lemma)?.definition ?? definitions.get(d.lemma) ?? null),
      firstLetter: answer[0],
      length: answer.length,
      options,
      exposures: d.exposures,
      streak: d.srsStreak,
      isPhrase: d.isPhrase,
      checkup: d.status === "KNOWN",
      contexts: Array.isArray(d.contexts) ? d.contexts.length : 1,
    };
  });

  return { cards, mode, totalDue, accuracy };
}
