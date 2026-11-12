/**
 * Loads the built-in IELTS passages and the demo Anki deck, and creates demo accounts with some history.
 * Usage: npm run db:seed              (passages + demo data)
 *        npm run db:seed -- --content (passages and demo deck only)
 */
import "dotenv/config";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { readApkg } from "../src/lib/apkg";
import { db } from "../src/lib/db";
import { applyReviews, personalDeck, type Review } from "../src/lib/decks";
import { saveImportedDeck } from "../src/lib/deck-import";
import { answerKey, passageSchema, type QuestionGroup } from "../src/lib/passage-format";
import { retryQuestion, submitFirst, tagQuestion, type Evidence } from "../src/lib/passages";
import { emptyTelemetry, type SubmissionMeta } from "../src/lib/telemetry";
import { buildApkg, type DemoNote } from "./apkg-builder";

export const DEMO_PASSWORD = "lingify-demo";
const DEMO_DECK = "IELTS Academic Vocabulary (demo)";

async function seedPassages() {
  const files = readdirSync("content/ielts").filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const data = passageSchema.parse(JSON.parse(readFileSync(`content/ielts/${f}`, "utf8")));
    const slug = f.replace(/\.json$/, "");
    const fields = {
      title: data.title,
      timeLimit: data.timeLimit,
      paragraphs: data.paragraphs,
      groups: data.questionGroups,
      paragraphCount: data.paragraphs.length,
      questionCount: data.questionGroups.reduce((n, g) => n + g.questions.length, 0),
      ownerId: null,
    };
    await db.passage.upsert({ where: { slug }, create: { slug, ...fields }, update: fields });
  }
  console.log(`passages: ${files.length}`);
}

/** A small deck built as a real .apkg and imported through the same code as an admin upload. */
async function seedDeck() {
  const glossary = JSON.parse(readFileSync("content/glossary.json", "utf8")) as Record<string, [string, string, string?]>;
  const notes: DemoNote[] = Object.entries(glossary)
    .slice(0, 40)
    .map(([word, [pos, definition, uz]]) => ({ basic: { front: word, back: `<i>${pos}</i><br>${definition}${uz ? `<br><span style="color:#6b7378">${uz}</span>` : ""}` } }));
  notes.push(
    { cloze: "Early studies suggested that bilingual children were {{c1::confused}} and performed worse at school." },
    { cloze: "The observatory was {{c1::equipped}} with a huge sextant cut into a hill." },
    { cloze: "Researchers {{c1::pointed out}} that these early studies had serious {{c2::weaknesses}}." },
  );
  const file = buildApkg(DEMO_DECK, notes);
  writeFileSync("public/samples/demo-deck.apkg", file);
  await db.deck.deleteMany({ where: { ownerId: null, name: DEMO_DECK } });
  const deck = await saveImportedDeck(readApkg(file, DEMO_DECK));
  console.log(`demo deck: ${notes.length} notes (public/samples/demo-deck.apkg)`);
  return deck;
}

/** The exam answer for a question, read from the passage file (demo data only). */
function answerOf(groups: QuestionGroup[], number: number) {
  for (const g of groups) {
    const q = g.questions.find((x) => x.number === number) as { answer?: string; answers?: string[] } | undefined;
    if (q) return q.answer ?? q.answers![0];
  }
  return "";
}

/** A plausible wrong answer of the right shape. */
function wrongOf(groups: QuestionGroup[], number: number) {
  const g = groups.find((x) => x.questions.some((q) => q.number === number))!;
  const right = answerOf(groups, number);
  const pools: Record<string, string[]> = {
    tfng: ["TRUE", "FALSE", "NOT GIVEN"],
    ynng: ["YES", "NO", "NOT GIVEN"],
    headings: ["i", "ii", "iii", "iv", "v", "vi", "vii"],
    mcq: ["A", "B", "C", "D"],
    matching: ["A", "B", "C", "D", "E"],
  };
  return (pools[g.type] ?? ["something else"]).find((v) => v.toUpperCase() !== right.toUpperCase())!;
}

function evidenceFor(paragraphs: string[], groups: QuestionGroup[], number: number, wrongPlace = false): Evidence {
  const q = groups.flatMap((g) => g.questions as { number: number; evidence?: string }[]).find((x) => x.number === number)!;
  let p = q.evidence ? q.evidence.charCodeAt(0) - 65 : 0;
  if (wrongPlace) p = (p + 1) % paragraphs.length;
  const text = paragraphs[p];
  const end = Math.min(text.length, (text.indexOf(". ") + 1 || 120));
  return { paragraph: p, start: 0, end, text: text.slice(0, end) };
}

async function demoAttempt(
  userId: string,
  slug: string,
  plan: { wrong: number[]; fixed?: { n: number; tag: "VOCAB" | "DISTRACTOR" | "LOGIC" | "CARELESS"; wrongPlace?: boolean }[]; stuck?: number[]; blank?: number[] },
  test: { seconds: number; gap?: number; meta?: Partial<SubmissionMeta> } = { seconds: 17 * 60 },
) {
  const passage = await db.passage.findUniqueOrThrow({ where: { slug } });
  const groups = passage.groups as QuestionGroup[];
  const keys = answerKey(groups);
  // The test "started" `seconds` ago by the server's clock, so the pacing checks see a realistic (or not) length.
  const attempt = await db.passageAttempt.create({
    data: { userId, passageId: passage.id, total: keys.length, startedAt: new Date(Date.now() - 3 * 86_400_000), testStartedAt: new Date(Date.now() - test.seconds * 1000) },
  });
  const answers = Object.fromEntries(
    keys.map((k) => [k.number, plan.blank?.includes(k.number) ? "" : plan.wrong.includes(k.number) ? wrongOf(groups, k.number) : answerOf(groups, k.number)]),
  );
  // First answers spread over the test (or `gap` seconds apart), with time on each question, as the browser would send.
  const gap = test.gap ?? Math.floor(test.seconds / (keys.length + 1));
  const answerTimes = Object.fromEntries(keys.filter((k) => answers[k.number]).map((k, i) => [String(k.number), 30 + i * gap]));
  const perQuestionSec = Object.fromEntries(keys.map((k) => [String(k.number), Math.max(2, gap - 3)]));
  const meta: SubmissionMeta = {
    reason: "NORMAL",
    events: [],
    ...test.meta,
    telemetry: { ...emptyTelemetry(), durationSec: test.seconds, answerTimes, perQuestionSec, ...test.meta?.telemetry },
  };
  await submitFirst(userId, attempt.id, answers, {}, test.seconds, meta);
  for (const f of plan.fixed ?? []) {
    await retryQuestion(userId, attempt.id, f.n, answerOf(groups, f.n), evidenceFor(passage.paragraphs, groups, f.n, f.wrongPlace));
    await tagQuestion(userId, attempt.id, f.n, f.tag);
  }
  for (const n of plan.stuck ?? []) {
    // Three wrong tries in different places: the teacher sees this student as stuck.
    const g = groups.find((x) => x.questions.some((q) => q.number === n))!;
    const options = g.type === "headings" ? ["i", "ii", "iii", "iv", "v", "vi", "vii"] : ["TRUE", "FALSE", "NOT GIVEN"];
    const right = answerOf(groups, n).toUpperCase();
    for (const o of options.filter((v) => v.toUpperCase() !== right && v !== answers[n]).slice(0, 2)) {
      await retryQuestion(userId, attempt.id, n, o, evidenceFor(passage.paragraphs, groups, n, true));
    }
  }
}

async function seedDemo(deckId: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await db.user.deleteMany({ where: { email: { endsWith: "@lingify.test" } } });

  const teacher = await db.user.create({ data: { email: "teacher@lingify.test", name: "Ms Rahimova", passwordHash, role: "TEACHER" } });
  const cls = await db.class.create({ data: { name: "IELTS Morning Group", joinCode: "DEMO01", teacherId: teacher.id } });
  const now = new Date();

  const students = await Promise.all(
    [
      { email: "student@lingify.test", name: "Aisha Karimova", lastActiveAt: new Date(now.getTime() - 86_400_000) },
      { email: "jasur@lingify.test", name: "Jasur Aliev", lastActiveAt: now },
      { email: "malika@lingify.test", name: "Malika Tursunova", lastActiveAt: new Date(now.getTime() - 9 * 86_400_000) },
    ].map((s) => db.user.create({ data: { ...s, passwordHash, role: "STUDENT", createdAt: new Date(now.getTime() - 21 * 86_400_000) } })),
  );
  const [aisha, jasur, malika] = students;
  await db.enrollment.createMany({ data: students.map((s) => ({ userId: s.id, classId: cls.id })) });

  const brains = await db.passage.findUniqueOrThrow({ where: { slug: "bilingual-brains" } });
  const aral = await db.passage.findUniqueOrThrow({ where: { slug: "the-aral-sea" } });
  const ulughBeg = await db.passage.findUniqueOrThrow({ where: { slug: "ulugh-beg-observatory" } });
  for (const [passage, days, note] of [
    [brains, -2, "Read the questions first"],
    [aral, 3, null],
  ] as const) {
    await db.assignment.create({
      data: {
        classId: cls.id,
        passageId: passage.id,
        note,
        dueAt: new Date(now.getTime() + days * 86_400_000),
        createdAt: new Date(now.getTime() - 5 * 86_400_000),
        recipients: { create: students.map((s) => ({ studentId: s.id })) },
      },
    });
  }
  // Aisha alone also has a third passage assigned, for the demo attempt below.
  await db.assignment.create({
    data: {
      classId: cls.id,
      passageId: ulughBeg.id,
      dueAt: new Date(now.getTime() + 5 * 86_400_000),
      createdAt: new Date(now.getTime() - 5 * 86_400_000),
      recipients: { create: [{ studentId: aisha.id }] },
    },
  });

  // Aisha: made mistakes on headings and NG-vs-False, corrected them all.
  await demoAttempt(aisha.id, "bilingual-brains", {
    wrong: [3, 7, 8, 11],
    fixed: [
      { n: 3, tag: "LOGIC" },
      { n: 7, tag: "DISTRACTOR", wrongPlace: true },
      { n: 8, tag: "DISTRACTOR" },
      { n: 11, tag: "VOCAB" },
    ],
  });
  await demoAttempt(aisha.id, "ulugh-beg-observatory", { wrong: [2, 6, 9], fixed: [{ n: 2, tag: "LOGIC" }, { n: 6, tag: "DISTRACTOR" }] });
  // Jasur: one question still red after three tries.
  await demoAttempt(jasur.id, "bilingual-brains", { wrong: [4, 7], fixed: [{ n: 4, tag: "CARELESS" }], stuck: [7] });
  // Jasur again: left the tab six minutes into the Aral Sea test, which submitted it (strict lock).
  await demoAttempt(jasur.id, "the-aral-sea", { wrong: [2, 5], blank: [6, 7, 8, 9, 10, 11, 12, 13] }, {
    seconds: 360,
    gap: 70,
    meta: { reason: "TAB_HIDDEN", events: [{ type: "WINDOW_BLUR", atMs: 200_000 }, { type: "TAB_HIDDEN", atMs: 360_000 }] },
  });
  void malika;

  // Some flashcard history for Aisha, so her own deck has learning and due cards (shared decks aren't hers to study).
  const demoCards = await db.card.findMany({ where: { deckId }, orderBy: { position: "asc" }, take: 12, select: { front: true, back: true, noteType: true } });
  const aishaDeck = await personalDeck(aisha.id);
  await db.card.createMany({ data: demoCards.map((c, position) => ({ ...c, deckId: aishaDeck.id, position })) });
  const cards = await db.card.findMany({ where: { deckId: aishaDeck.id }, orderBy: { position: "asc" } });
  const reviews: Review[] = [];
  for (const [i, c] of cards.entries()) {
    const at = new Date(now.getTime() - (6 - (i % 5)) * 86_400_000);
    reviews.push({ cardId: c.id, rating: 3, at, durationMs: 4000 + (i % 4) * 1500 });
    if (i % 3 === 0) reviews.push({ cardId: c.id, rating: 3, at: new Date(at.getTime() + 600_000), durationMs: 3500 });
  }
  await applyReviews(aisha.id, reviews);

  // Jasur clicked through a deck: every new card "Easy" in well under a second.
  const jasurDeck = await personalDeck(jasur.id);
  await db.card.createMany({ data: demoCards.map((c, position) => ({ ...c, deckId: jasurDeck.id, position })) });
  const jasurCards = await db.card.findMany({ where: { deckId: jasurDeck.id }, orderBy: { position: "asc" } });
  await applyReviews(jasur.id, jasurCards.map((c, i) => ({ cardId: c.id, rating: 4, at: new Date(now.getTime() - 86_400_000 + i * 1000), durationMs: 600 + (i % 3) * 100 })));
  console.log("demo: teacher@lingify.test, student@lingify.test, jasur@lingify.test, malika@lingify.test");
}

async function main() {
  await seedPassages();
  const deck = await seedDeck();
  if (!process.argv.includes("--content")) await seedDemo(deck.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
