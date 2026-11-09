/**
 * Builds database rows for the library from content/texts (the stories) and content/lessons (the teaching material),
 * checking that every lesson item actually matches its text.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { frequencyRank } from "../src/lib/frequency";
import { glossaryEntry } from "../src/lib/glossary";
import { grammarInfo } from "../src/lib/grammar-sequence";
import { canonicalLemma } from "../src/lib/lemma";
import { findMarks } from "../src/lib/marks";
import { lemmatizeWord, tokenize } from "../src/lib/nlp";
import { READING_SKILLS, type Choice, type GrammarPoint, type Question, type ReadingSkill } from "../src/lib/texts";

type TextFile = {
  slug: string;
  title: string;
  summary: string;
  genre: string;
  topics: string[];
  paragraphs: string[];
  questions: Question[];
  grammar: Omit<GrammarPoint, "key" | "examples" | "highlights" | "marks" | "discovery">[];
};

type LessonFile = {
  series: { id: string; title: string; part: number } | null;
  leadIn: string;
  prediction: Choice;
  preTeach: { word: string; definition: string; ccq: Choice }[];
  gist: Question;
  skills: ReadingSkill[];
  extraQuestion: Question & { skill: ReadingSkill };
  response: string;
  phrases: { phrase: string; inText: string; meaning: string }[];
  grammar: { key: string; examples: string[]; highlights: string[]; discovery: Question }[];
};

const root = path.resolve(import.meta.dirname, "..");
const read = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8"));
const stripEnd = (s: string) => s.replace(/[.,!?]$/, "");

function checkChoice(slug: string, c: Choice | Question, label: string) {
  if (!c || !Array.isArray(c.options) || c.answer < 0 || c.answer >= c.options.length) {
    throw new Error(`${slug}: ${label} has an invalid answer index`);
  }
}

export function loadLibrary() {
  const files = readdirSync(path.join(root, "content/texts")).filter((f) => f.endsWith(".json")).sort();
  const seriesTitles = new Map<string, string>();
  const missingGlossary = new Set<string>();

  const rows = files.map((file) => {
    const t = read<TextFile>(path.join(root, "content/texts", file));
    const lessonPath = path.join(root, "content/lessons", file);
    const l = read<LessonFile>(lessonPath);
    const fail = (msg: string) => {
      throw new Error(`${t.slug}: ${msg}`);
    };
    const { paragraphs, sentences, lemmaCounts, wordCount } = tokenize(t.paragraphs);
    const body = t.paragraphs.join(" ");
    const tokens = paragraphs.flat();

    for (const q of t.questions) checkChoice(t.slug, q, `question "${q.question}"`);
    checkChoice(t.slug, l.prediction, "prediction");
    checkChoice(t.slug, l.gist, "gist question");
    checkChoice(t.slug, l.extraQuestion, "extra question");
    if (l.skills.length !== t.questions.length) fail(`needs ${t.questions.length} skill tags, has ${l.skills.length}`);
    for (const skill of [...l.skills, l.extraQuestion.skill]) {
      if (!READING_SKILLS.includes(skill)) fail(`unknown reading skill "${skill}"`);
    }
    if (!l.leadIn || !l.response) fail("lead-in and response prompt are required");

    const preTeach = l.preTeach.map((w) => {
      checkChoice(t.slug, w.ccq, `concept question for ${w.word}`);
      const base = lemmatizeWord(w.word.toLowerCase());
      const guess = canonicalLemma(base.lemma, w.word, base.pos);
      const token = tokens.find((tok) => tok.v.toLowerCase() === w.word.toLowerCase()) ?? tokens.find((tok) => tok.l === guess);
      if (!token) fail(`pre-taught word "${w.word}" is not in the text`);
      return { ...w, lemma: token!.l ?? guess };
    });
    if (preTeach.length > 3) fail("pre-teach at most 3 words");

    const phrases = l.phrases.map((ph) => {
      const marks = findMarks(paragraphs, ph.inText);
      if (!marks.length) fail(`phrase "${ph.inText}" is not in the text`);
      return { ...ph, marks };
    });

    if (l.grammar.length !== t.grammar.length) fail(`lesson has ${l.grammar.length} grammar points, text has ${t.grammar.length}`);
    const grammar = t.grammar.map((g, i) => {
      const lg = l.grammar[i];
      if (!grammarInfo(lg.key)) fail(`unknown grammar key "${lg.key}"`);
      if (!body.includes(stripEnd(g.example))) fail(`grammar example not in text: ${g.example}`);
      if (!body.includes(stripEnd(lg.examples[0]))) fail(`first discovery example must come from the text: ${lg.examples[0]}`);
      for (const h of lg.highlights) {
        if (!lg.examples.some((e) => e.includes(h))) fail(`highlight "${h}" is not in any example`);
      }
      checkChoice(t.slug, lg.discovery, `discovery question for ${lg.key}`);
      checkChoice(t.slug, g.exercise, `exercise for ${lg.key}`);
      const marks = lg.highlights.flatMap((h) => findMarks(paragraphs, h));
      return { ...g, key: lg.key, examples: lg.examples, highlights: lg.highlights, marks, discovery: lg.discovery };
    });

    for (const lemma of Object.keys(lemmaCounts)) {
      if ((frequencyRank(lemma) ?? Infinity) >= 2000 && !glossaryEntry(lemma)) missingGlossary.add(lemma);
    }
    if (l.series) seriesTitles.set(l.series.id, l.series.title);

    return {
      slug: t.slug,
      title: t.title,
      summary: t.summary,
      genre: t.genre,
      topics: t.topics,
      paragraphs,
      sentences,
      lemmaCounts,
      wordCount,
      questions: [
        ...t.questions.map((q, i) => ({ ...q, skill: l.skills[i] })),
        l.extraQuestion,
      ],
      grammar,
      leadIn: l.leadIn,
      prediction: l.prediction,
      preTeach,
      gist: l.gist,
      response: l.response,
      phrases,
      series: l.series?.id ?? null,
      seriesPart: l.series?.part ?? null,
    };
  });

  return { rows, seriesTitles, missingGlossary: [...missingGlossary].sort() };
}
