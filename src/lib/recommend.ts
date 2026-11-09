import "server-only";
import { db } from "./db";
import { coverageOf, levelFor, type LemmaCounts, type TextLevel } from "./texts";
import { wordSets } from "./vocab";

export type LibraryEntry = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  genre: string;
  topics: string[];
  wordCount: number;
  coverage: number;
  level: TextLevel;
  newWords: number;
  /** distinct words in the student's learning queue that this text recycles */
  recycled: number;
  completed: boolean;
  assigned: boolean;
  score: number;
};

export async function libraryFor(userId: string): Promise<LibraryEntry[]> {
  const [texts, { known, learning }, user, sessions, assignments] = await Promise.all([
    db.text.findMany({ select: { id: true, slug: true, title: true, summary: true, genre: true, topics: true, wordCount: true, lemmaCounts: true } }),
    wordSets(userId),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { topicPrefs: true } }),
    db.readingSession.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { textId: true, text: { select: { genre: true } } },
    }),
    db.assignmentRecipient.findMany({
      where: { studentId: userId, completedAt: null, assignment: { kind: "TEXT" } },
      select: { assignment: { select: { textId: true } } },
    }),
  ]);

  const completed = new Set(sessions.map((s) => s.textId));
  const recentGenres = new Set(sessions.slice(0, 3).map((s) => s.text.genre));
  const assigned = new Set(assignments.map((a) => a.assignment.textId));
  const prefs = new Set(user.topicPrefs);

  return texts
    .map((t) => {
      const counts = t.lemmaCounts as LemmaCounts;
      const { coverage, unknownLemmas } = coverageOf(counts, known);
      const recycled = Object.keys(counts).filter((l) => learning.has(l)).length;
      const level = levelFor(coverage);
      const isCompleted = completed.has(t.id);
      const isAssigned = assigned.has(t.id);
      const score =
        (level === "locked" ? -100 : 0) +
        (isCompleted ? -20 : 0) +
        (isAssigned ? 10 : 0) +
        Math.min(recycled, 8) * 1.5 +
        (t.topics.some((topic) => prefs.has(topic)) ? 3 : 0) +
        (recentGenres.has(t.genre) ? 0 : 2);
      return {
        id: t.id,
        slug: t.slug,
        title: t.title,
        summary: t.summary,
        genre: t.genre,
        topics: t.topics,
        wordCount: t.wordCount,
        coverage,
        level,
        newWords: unknownLemmas.length,
        recycled,
        completed: isCompleted,
        assigned: isAssigned,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}
