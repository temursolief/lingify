/**
 * Loads the graded library from content/texts and creates demo accounts.
 * Usage: npm run db:seed            (library + demo data)
 *        npm run db:seed -- --texts (library only)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { lemmaRanks } from "../src/lib/frequency";
import { firstDue } from "../src/lib/srs";
import type { Question } from "../src/lib/texts";
import { loadLibrary } from "./library";
import { addDays, dayOf } from "../src/lib/time";

export const DEMO_PASSWORD = "lingify-demo";

async function seedTexts() {
  const { rows, seriesTitles, missingGlossary } = loadLibrary();
  for (const { slug, ...data } of rows) {
    await db.text.upsert({ where: { slug }, create: { slug, ...data }, update: data });
  }
  console.log(`library: ${rows.length} texts, ${seriesTitles.size} series`);
  if (missingGlossary.length) console.log(`no B1 definition yet (dictionary fallback): ${missingGlossary.join(", ")}`);
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
  weakSkills: string[];
};

function hashOf(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const DEMO_STUDENTS: DemoStudent[] = [
  { email: "student@lingify.test", name: "Aisha Karimova", vocab: 2600, topics: ["science", "animals", "history"], activeDaysAgo: [1, 2, 3, 4, 6, 7, 9, 10, 12], quizAccuracy: 0.82, readingWpm: 118, weakSkills: ["vocabulary", "attitude"] },
  { email: "jasur@lingify.test", name: "Jasur Aliev", vocab: 2900, topics: ["sports", "technology", "money"], activeDaysAgo: [0, 1, 2, 3, 4, 5, 6, 8, 11, 13], quizAccuracy: 0.9, readingWpm: 135, weakSkills: ["organisation"] },
  { email: "malika@lingify.test", name: "Malika Tursunova", vocab: 2200, topics: ["family", "music", "art"], activeDaysAgo: [9, 11, 12, 15], quizAccuracy: 0.5, readingWpm: 85, weakSkills: ["inference", "reference"] },
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
      const grammarPoints = text.grammar as { key: string }[];
      const roll = (key: string, chance: number) => (hashOf(key + s.email) % 100) / 100 < chance;
      await db.exerciseAttempt.createMany({
        data: [
          ...(questions as (Question & { skill: string })[]).map((q, i) => ({
            userId: user.id, textId: text.id, kind: "COMPREHENSION" as const, itemKey: `${text.id}:COMPREHENSION:${i}`,
            skill: q.skill, correct: roll(`${text.id}${i}`, s.quizAccuracy - (s.weakSkills.includes(q.skill) ? 0.35 : 0)), answeredAt: at,
          })),
          { userId: user.id, textId: text.id, kind: "GIST" as const, itemKey: `${text.id}:GIST`, skill: "gist", correct: roll(`${text.id}g`, s.quizAccuracy + 0.1), answeredAt: at },
          ...grammarPoints.map((g, i) => ({
            userId: user.id, textId: text.id, kind: "GRAMMAR" as const, itemKey: `${text.id}:GRAMMAR:${i}`,
            skill: g.key, correct: roll(`${text.id}gr${i}`, s.quizAccuracy), answeredAt: at,
          })),
        ],
      });
      await db.textRating.create({
        data: {
          userId: user.id, textId: text.id, enjoyment: 1 + (hashOf(text.slug + s.email) % 3),
          difficulty: s.vocab < 2400 ? 1 : 0, recommend: hashOf(text.slug + s.name) % 2 === 0,
        },
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

  const fluencyTexts = texts.slice(0, 3);
  for (const s of DEMO_STUDENTS.slice(0, 2)) {
    const user = await db.user.findUniqueOrThrow({ where: { email: s.email } });
    for (const [i, text] of fluencyTexts.entries()) {
      const wpm = s.readingWpm + 15 + i * 12;
      await db.fluencyRun.create({
        data: { userId: user.id, textId: text.id, wpm, seconds: Math.round((text.wordCount / wpm) * 60), gistCorrect: true, createdAt: addDays(now, -(6 - i * 2)) },
      });
    }
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
