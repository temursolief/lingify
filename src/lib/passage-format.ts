import { z } from "zod";

/**
 * The JSON format teachers upload for an IELTS Academic Reading passage. It is the format stored in the database too,
 * so what the teacher writes is exactly what students get. The Format guide page shows this schema with an example.
 *
 * Questions are numbered like the real exam (1, 2, 3 …) and every number must be unique within the passage.
 * Paragraphs are labelled A, B, C … in the order given; use those letters for `evidence`, `paragraph` and matching answers.
 */

const letter = z
  .string()
  .regex(/^[A-Z]$/, "Use a capital paragraph letter such as \"C\"")
  .describe("paragraph letter");

const base = {
  number: z.number().int().min(1).max(60),
  /** optional: the paragraph that proves the answer, so Lingify can tell location errors from comprehension errors */
  evidence: letter.optional(),
  /** optional: shown only after the student has found the right answer */
  explanation: z.string().max(600).optional(),
};

const instructions = z.string().min(1).max(600);

/** An accepted answer. Placeholders from the sample file ("FILL IN", "?") are rejected so they are never uploaded by mistake. */
const answerText = z
  .string()
  .min(1)
  .max(60)
  .refine((a) => !/^(\?+|todo|fill in|xxx+|_+)$/i.test(a.trim()), "Replace the placeholder with the real answer");
const answers = z.array(answerText).min(1);
/** "NO MORE THAN TWO WORDS AND/OR A NUMBER": a number in the answer does not count towards maxWords. */
const allowNumber = z.boolean().optional();

export const tfngGroup = z.object({
  type: z.literal("tfng"),
  instructions,
  questions: z.array(z.object({ ...base, statement: z.string().min(1).max(400), answer: z.enum(["TRUE", "FALSE", "NOT GIVEN"]) })).min(1),
});

export const ynngGroup = z.object({
  type: z.literal("ynng"),
  instructions,
  questions: z.array(z.object({ ...base, statement: z.string().min(1).max(400), answer: z.enum(["YES", "NO", "NOT GIVEN"]) })).min(1),
});

export const mcqGroup = z.object({
  type: z.literal("mcq"),
  instructions,
  questions: z
    .array(
      z.object({
        ...base,
        question: z.string().min(1).max(400),
        /** written without the letter: Lingify adds A, B, C, D */
        options: z.array(z.string().min(1).max(300)).min(2).max(6),
        answer: letter,
      }),
    )
    .min(1),
});

export const headingsGroup = z.object({
  type: z.literal("headings"),
  instructions,
  /** written without numerals: Lingify adds i, ii, iii … */
  headings: z.array(z.string().min(1).max(200)).min(2).max(12),
  questions: z.array(z.object({ ...base, paragraph: letter, answer: z.string().regex(/^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/, "Use a lower-case roman numeral such as \"iii\"") })).min(1),
});

export const matchingGroup = z.object({
  type: z.literal("matching"),
  instructions,
  questions: z.array(z.object({ ...base, statement: z.string().min(1).max(400), answer: letter })).min(1),
});

export const completionGroup = z.object({
  type: z.literal("completion"),
  instructions,
  maxWords: z.number().int().min(1).max(5),
  allowNumber,
  /** each sentence has one gap written as ___ (three underscores) */
  questions: z.array(z.object({ ...base, text: z.string().includes("___", { message: "Mark the gap with ___" }), answers })).min(1),
});

export const summaryGroup = z.object({
  type: z.literal("summary"),
  instructions,
  maxWords: z.number().int().min(1).max(5),
  allowNumber,
  title: z.string().max(120).optional(),
  /** the summary, with each gap written as {{number}}, e.g. "Early research was {{12}} because…" */
  text: z.string().min(1).max(3000),
  questions: z.array(z.object({ ...base, answers })).min(1),
});

/**
 * Note completion, as in IELTS Listening: one note per line, "## " starts a heading, "* " a bullet point,
 * and each gap is written as {{number}}.
 */
export const notesGroup = z.object({
  type: z.literal("notes"),
  instructions,
  maxWords: z.number().int().min(1).max(5),
  allowNumber,
  title: z.string().max(120).optional(),
  text: z.string().min(1).max(5000),
  questions: z.array(z.object({ ...base, answers })).min(1),
});

export const questionGroup = z.discriminatedUnion("type", [tfngGroup, ynngGroup, mcqGroup, headingsGroup, matchingGroup, completionGroup, summaryGroup, notesGroup]);

type AnyGroup = z.output<typeof questionGroup>;

/** Rules shared by reading and listening: unique numbers, valid options, and a gap in the text for every question. */
export function checkGroups(groups: AnyGroup[], ctx: z.RefinementCtx, lastLetter: string | null) {
  const seen = new Set<number>();
  groups.forEach((g, gi) => {
    g.questions.forEach((q, qi) => {
      const path = ["questionGroups", gi, "questions", qi];
      if (seen.has(q.number)) ctx.addIssue({ code: "custom", path: [...path, "number"], message: `Question ${q.number} appears twice` });
      seen.add(q.number);
      const letters = [q.evidence, g.type === "headings" ? (q as { paragraph: string }).paragraph : null, g.type === "matching" ? (q as { answer: string }).answer : null];
      for (const l of letters) {
        if (!l) continue;
        if (lastLetter === null) ctx.addIssue({ code: "custom", path, message: "Listening lessons have no paragraphs: remove evidence and paragraph letters" });
        else if (l > lastLetter) ctx.addIssue({ code: "custom", path, message: `Paragraph ${l} does not exist (the last one is ${lastLetter})` });
      }
      if (g.type === "mcq" && (q as { answer: string }).answer.charCodeAt(0) - 65 >= (q as { options: string[] }).options.length) {
        ctx.addIssue({ code: "custom", path: [...path, "answer"], message: `Answer ${(q as { answer: string }).answer} is not one of the options` });
      }
      if (g.type === "headings" && ROMAN.indexOf((q as { answer: string }).answer) >= g.headings.length) {
        ctx.addIssue({ code: "custom", path: [...path, "answer"], message: `There is no heading ${(q as { answer: string }).answer}` });
      }
    });
    if (g.type === "summary" || g.type === "notes") {
      for (const q of g.questions) {
        if (!g.text.includes(`{{${q.number}}}`)) ctx.addIssue({ code: "custom", path: ["questionGroups", gi, "text"], message: `The text has no gap {{${q.number}}}` });
      }
    }
  });
}

export const passageSchema = z
  .object({
    title: z.string().min(1).max(160),
    timeLimit: z.number().int().min(5).max(60).default(20),
    paragraphs: z.array(z.string().min(1).max(4000)).min(1).max(26),
    questionGroups: z.array(questionGroup).min(1),
  })
  .superRefine((p, ctx) => checkGroups(p.questionGroups, ctx, paragraphLetter(p.paragraphs.length - 1)));

/** The YouTube video id from a watch, share, embed or shorts link, or a bare id. */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}



export type PassageInput = z.input<typeof passageSchema>;
export type PassageData = z.output<typeof passageSchema>;
export type QuestionGroup = z.output<typeof questionGroup>;
export type GroupType = QuestionGroup["type"];

export const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];
export const paragraphLetter = (i: number) => String.fromCharCode(65 + i);

export const GROUP_LABEL: Record<GroupType, string> = {
  tfng: "True / False / Not Given",
  ynng: "Yes / No / Not Given",
  mcq: "Multiple choice",
  headings: "Matching headings",
  matching: "Matching information",
  completion: "Sentence completion",
  summary: "Summary completion",
  notes: "Note completion",
};

/** Readable error lines for the upload form, e.g. "questionGroups → 2 → questions → 1 → answer: …". */
export function formatIssues(error: z.ZodError) {
  return error.issues.slice(0, 12).map((i) => `${i.path.length ? i.path.join(" → ") + ": " : ""}${i.message}`);
}

export function parseJson<T>(raw: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; errors: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, errors: [`This is not valid JSON: ${(e as Error).message}`] };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, errors: formatIssues(parsed.error) };
}

export const parsePassageJson = (raw: string) => parseJson(raw, passageSchema);

/* ---------------- what the browser may see ---------------- */

/** Questions without answers, evidence or explanations: safe to send before a question is answered correctly. */
export function publicGroups(groups: QuestionGroup[]) {
  return groups.map((g) => {
    const HIDDEN = new Set(["answer", "answers", "evidence", "explanation"]);
    const strip = (q: object) => Object.fromEntries(Object.entries(q).filter(([k]) => !HIDDEN.has(k)));
    return { ...g, questions: g.questions.map(strip) } as unknown as PublicGroup;
  });
}

export type PublicGroup =
  | { type: "tfng" | "ynng" | "matching"; instructions: string; questions: { number: number; statement: string }[] }
  | { type: "mcq"; instructions: string; questions: { number: number; question: string; options: string[] }[] }
  | { type: "headings"; instructions: string; headings: string[]; questions: { number: number; paragraph: string }[] }
  | { type: "completion"; instructions: string; maxWords: number; allowNumber?: boolean; questions: { number: number; text: string }[] }
  | { type: "summary" | "notes"; instructions: string; maxWords: number; allowNumber?: boolean; title?: string; text: string; questions: { number: number }[] };

/* ---------------- grading ---------------- */

export function normalizeAnswer(s: string) {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,;:!?"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

export type QuestionKey = { number: number; type: GroupType; evidence?: string; explanation?: string; check: (given: string) => boolean };

/** Every question in the passage with a function that checks an answer. Answers never leave the server. */
export function answerKey(groups: QuestionGroup[]): QuestionKey[] {
  return groups.flatMap((g) =>
    g.questions.map((q): QuestionKey => {
      const common = { number: q.number, type: g.type, evidence: q.evidence, explanation: q.explanation };
      switch (g.type) {
        case "tfng":
        case "ynng":
        case "mcq":
        case "matching":
        case "headings": {
          const expected = (q as { answer: string }).answer;
          return { ...common, check: (given) => given.trim().toUpperCase() === expected.toUpperCase() };
        }
        case "completion":
        case "summary":
        case "notes": {
          const accepted = (q as { answers: string[] }).answers.map(normalizeAnswer);
          return {
            ...common,
            check: (given) => {
              const n = normalizeAnswer(given);
              return withinLimit(n, g.maxWords, !!g.allowNumber) && accepted.includes(n);
            },
          };
        }
      }
    }),
  );
}

/** Word limit for gap answers; with allowNumber, one number ("1878", "1.5 million") does not count as a word. */
export function withinLimit(normalized: string, maxWords: number, allowNumber: boolean) {
  const tokens = normalized.split(" ").filter(Boolean);
  if (!tokens.length) return false;
  const isNumber = (t: string) => /^[\d.,%]+$/.test(t) || ["million", "thousand", "hundred", "billion"].includes(t);
  const numbers = tokens.filter(isNumber).length;
  return allowNumber && numbers ? tokens.length - numbers <= maxWords : tokens.length <= maxWords;
}

/** Raw score out of 40 → band, following the published IELTS Academic Reading and Listening conversions. */
const BAND_TABLE: Record<"reading" | "listening", [number, number][]> = {
  reading: [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [0, 2]],
  listening: [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [0, 2]],
};

/** One passage or lesson is part of a real test, so its score is scaled to 40 before converting: an estimate, not a real band. */
export function estimateBand(correct: number, total: number, kind: "reading" | "listening" = "reading") {
  const raw = total ? Math.round((correct / total) * 40) : 0;
  return BAND_TABLE[kind].find(([min]) => raw >= min)![1];
}

/* ---------------- the example on the Format guide ---------------- */

export const EXAMPLE_PASSAGE: PassageInput = {
  title: "The History of Glass",
  timeLimit: 20,
  paragraphs: [
    "Glass is one of the oldest materials made by humans. The earliest glass objects, small beads, were produced in Mesopotamia around 3,500 years ago.",
    "For centuries glass remained a luxury. It was only when Roman craftsmen learned to blow glass through a tube that it became cheap enough for ordinary households.",
    "Today, glass is used in everything from phone screens to fibre-optic cables, and researchers continue to develop new types for medicine and energy.",
  ],
  questionGroups: [
    {
      type: "tfng",
      instructions: "Do the following statements agree with the information given in the passage? Write TRUE, FALSE or NOT GIVEN.",
      questions: [
        { number: 1, statement: "The first glass objects were beads.", answer: "TRUE", evidence: "A", explanation: "Paragraph A: the earliest glass objects, small beads…" },
        { number: 2, statement: "Glass-blowing was invented in Mesopotamia.", answer: "FALSE", evidence: "B" },
        { number: 3, statement: "Most glass today is made in Asia.", answer: "NOT GIVEN" },
      ],
    },
    {
      type: "mcq",
      instructions: "Choose the correct letter, A, B, C or D.",
      questions: [
        {
          number: 4,
          question: "Glass became affordable because",
          options: ["new sand was discovered", "craftsmen began blowing it", "the Romans lowered taxes", "beads went out of fashion"],
          answer: "B",
          evidence: "B",
        },
      ],
    },
    {
      type: "headings",
      instructions: "Choose the correct heading for each paragraph from the list of headings below.",
      headings: ["An ancient invention", "Glass in modern life", "Dangers of glass", "From luxury to everyday object"],
      questions: [
        { number: 5, paragraph: "A", answer: "i" },
        { number: 6, paragraph: "B", answer: "iv" },
      ],
    },
    {
      type: "matching",
      instructions: "Which paragraph contains the following information? Write the correct letter, A–C.",
      questions: [{ number: 7, statement: "a mention of current scientific work", answer: "C" }],
    },
    {
      type: "completion",
      instructions: "Complete the sentences below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
      maxWords: 2,
      questions: [{ number: 8, text: "Glass is now found in phone screens and ___ cables.", answers: ["fibre-optic", "fiber-optic"], evidence: "C" }],
    },
    {
      type: "summary",
      instructions: "Complete the summary below. Choose ONE WORD ONLY from the passage for each answer.",
      maxWords: 1,
      title: "Glass through time",
      text: "Glass was first made in {{9}}. It stayed a {{10}} until the Romans found a cheaper method.",
      questions: [
        { number: 9, answers: ["Mesopotamia"], evidence: "A" },
        { number: 10, answers: ["luxury"], evidence: "B" },
      ],
    },
  ],
};
