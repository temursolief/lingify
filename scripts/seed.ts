/**
 * Loads the graded library from content/texts and creates demo accounts.
 * Usage: npm run db:seed            (library + demo data)
 *        npm run db:seed -- --texts (library only)
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { lemmaRanks } from "../src/lib/frequency";
import { tokenize } from "../src/lib/nlp";
import { firstDue } from "../src/lib/srs";
import type { GrammarPoint, Question } from "../src/lib/texts";
import { addDays, dayOf } from "../src/lib/time";

type TextFile = {
  slug: string;
  title: string;
  summary: string;
  genre: string;
  topics: string[];
  paragraphs: string[];
  questions: Question[];
  grammar: GrammarPoint[];
};

export const DEMO_PASSWORD = "lingify-demo";

async function seedTexts() {
  const dir = path.resolve(import.meta.dirname, "../content/texts");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const t: TextFile = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const body = t.paragraphs.join(" ");
    for (const g of t.grammar) {
      if (!body.includes(g.example.replace(/[.,!?]$/, ""))) throw new Error(`${t.slug}: grammar example not found in text: ${g.example}`);
    }
    for (const q of [...t.questions, ...t.grammar.map((g) => g.exercise)]) {
      if (q.answer < 0 || q.answer >= q.options.length) throw new Error(`${t.slug}: bad answer index in "${q.question}"`);
    }
    const { paragraphs, sentences, lemmaCounts, wordCount } = tokenize(t.paragraphs);
    const data = {
      title: t.title,
      summary: t.summary,
      genre: t.genre,
      topics: t.topics,
      paragraphs,
      sentences,
      lemmaCounts,
      wordCount,
      questions: t.questions,
      grammar: t.grammar,
    };
    await db.text.upsert({ where: { slug: t.slug }, create: { slug: t.slug, ...data }, update: data });
  }
  console.log(`library: ${files.length} texts`);
}

type DemoStudent = {
  email: string;
  name: string;
  vocab: number;
  topics: string[];
  /** days ago the student was active, with completed texts on some of them */
  activeDaysAgo: number[];
  quizAccuracy: number;
  readingWpm: number;
};

const DEMO_STUDENTS: DemoStudent[] = [
  { email: "student@lingify.test", name: "Aisha Karimova", vocab: 2600, topics: ["science", "animals", "history"], activeDaysAgo: [1, 2, 3, 4, 6, 7, 9, 10, 12], quizAccuracy: 0.82, readingWpm: 118 },
  { email: "jasur@lingify.test", name: "Jasur Aliev", vocab: 2900, topics: ["sports", "technology", "money"], activeDaysAgo: [0, 1, 2, 3, 4, 5, 6, 8, 11, 13], quizAccuracy: 0.9, readingWpm: 135 },
  { email: "malika@lingify.test", name: "Malika Tursunova", vocab: 2200, topics: ["family", "music", "art"], activeDaysAgo: [9, 11, 12, 15], quizAccuracy: 0.5, readingWpm: 85 },
];

async function seedDemo() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const texts = await db.text.findMany({ orderBy: { slug: "asc" } });

  await db.user.deleteMany({ where: { email: { endsWith: "@lingify.test" } } });

  const teacher = await db.user.create({
    data: { email: "teacher@lingify.test", name: "Ms Rahimova", passwordHash, role: "TEACHER", placementDone: true },
  });
  const cls = await db.class.create({ data: { name: "B1 Morning Group", joinCode: "DEMO01", teacherId: teacher.id } });

  const now = new Date();
  const today = dayOf(now);

  for (const [index, s] of DEMO_STUDENTS.entries()) {
    const startDay = addDays(today, -21);
    const user = await db.user.create({
      data: {
        email: s.email,
        name: s.name,
        passwordHash,
        role: "STUDENT",
        topicPrefs: s.topics,
        placementDone: true,
        estimatedVocab: s.vocab,
        createdAt: startDay,
        lastActiveAt: addDays(now, -Math.min(...s.activeDaysAgo)),
      },
    });
    await db.enrollment.create({ data: { userId: user.id, classId: cls.id } });

    await db.lemmaState.createMany({
      data: lemmaRanks.slice(0, s.vocab).map(([lemma]) => ({
        userId: user.id, lemma, status: "KNOWN" as const, source: "PLACEMENT" as const, knownAt: startDay,
      })),
    });

    const easy = texts.filter((t) => Object.keys(t.lemmaCounts as object).length > 0);
    const daysCompleted = [...s.activeDaysAgo].sort((a, b) => b - a);
    let textCursor = index * 3;
    let learnedSoFar = 0;

    for (const daysAgo of daysCompleted) {
      const day = addDays(today, -daysAgo);
      const at = new Date(day.getTime() + 15 * 3_600_000);
      const text = easy[textCursor++ % easy.length];
      const readingSeconds = Math.round((text.wordCount / s.readingWpm) * 60);
      const quizScore = Math.max(0, Math.min(1, s.quizAccuracy + (daysAgo % 3 === 0 ? -0.2 : 0.1) * (s.quizAccuracy < 0.6 ? 1 : 0.3)));
      await db.readingSession.create({
        data: {
          userId: user.id, textId: text.id, startedAt: at, completedAt: new Date(at.getTime() + readingSeconds * 1000),
          activeSeconds: readingSeconds, wpm: s.readingWpm + ((daysAgo * 7) % 15) - 7, coverage: 0.96, lookupCount: 3, quizScore,
        },
      });
      const questions = text.questions as Question[];
      await db.exerciseAttempt.createMany({
        data: questions.map((q, i) => ({
          userId: user.id, textId: text.id, kind: "COMPREHENSION" as const, itemKey: `${text.id}:q${i}`,
          correct: i / questions.length < quizScore, answeredAt: at,
        })),
      });
      const activities = [
        ["READING", readingSeconds],
        ["QUIZ", 150],
        ["VOCAB", 120],
        ["GRAMMAR", 90],
        ["REVIEW", daysAgo % 2 ? 300 : 180],
      ] as const;
      for (const [activity, seconds] of activities) {
        await db.activityTime.create({ data: { userId: user.id, day, activity, seconds } });
      }

      // A few words looked up in this text become learning words; older ones graduate to known.
      const lemmas = Object.keys(text.lemmaCounts as object).filter(
        (l) => !lemmaRanks.slice(0, s.vocab).some(([k]) => k === l),
      );
      for (const lemma of lemmas.slice(0, 3)) {
        const graduated = daysAgo > 7 && s.quizAccuracy > 0.6;
        const sentenceIndex = (text.paragraphs as { l: string | null; i: number; v: string }[][]).flat().find((tok) => tok.l === lemma);
        await db.lemmaState.upsert({
          where: { userId_lemma: { userId: user.id, lemma } },
          create: {
            userId: user.id, lemma, source: "LOOKUP", lookups: 1, exposures: 1,
            status: graduated ? "KNOWN" : "LEARNING",
            knownAt: graduated ? addDays(at, 6) : null,
            srsStreak: graduated ? 5 : 1, srsReviews: graduated ? 5 : 1, srsInterval: graduated ? 0 : 1,
            srsDue: graduated ? null : daysAgo < 3 ? firstDue(at) : addDays(now, -1),
            contextSentence: sentenceIndex ? text.sentences[sentenceIndex.i] : null,
            contextWord: sentenceIndex?.v, contextTextId: text.id, createdAt: at,
          },
          update: {},
        });
        if (graduated) learnedSoFar++;
      }
      await db.vocabSnapshot.upsert({
        where: { userId_day: { userId: user.id, day } },
        create: { userId: user.id, day, knownCount: s.vocab + learnedSoFar, learningCount: 3 },
        update: {},
      });
    }
    await db.vocabSnapshot.upsert({
      where: { userId_day: { userId: user.id, day: startDay } },
      create: { userId: user.id, day: startDay, knownCount: s.vocab, learningCount: 0 },
      update: {},
    });
  }

  await db.assignment.create({
    data: {
      classId: cls.id, kind: "GOAL", goalType: "WORDS_WEEK", target: 2000, note: "Read at least 2,000 words this week.",
      recipients: { create: (await db.enrollment.findMany({ where: { classId: cls.id } })).map((e) => ({ studentId: e.userId })) },
    },
  });

  console.log(`demo: teacher@lingify.test + ${DEMO_STUDENTS.length} students in class DEMO01 (password: ${DEMO_PASSWORD})`);
}

async function main() {
  await seedTexts();
  if (!process.argv.includes("--texts")) await seedDemo();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
