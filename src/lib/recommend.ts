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
  series: string | null;
  seriesPart: number | null;
  /** classmates who recommended this text */
  classmateRecs: number;
  /** this student stopped it as not interesting or too hard */
  stopped: "TOO_HARD" | "NOT_INTERESTED" | null;
  score: number;
};

export async function libraryFor(userId: string): Promise<LibraryEntry[]> {
  const [texts, { known, learning }, user, sessions, assignments, enrollments, ratings, stops] = await Promise.all([
    db.text.findMany({
      select: { id: true, slug: true, title: true, summary: true, genre: true, topics: true, wordCount: true, lemmaCounts: true, series: true, seriesPart: true },
    }),
    wordSets(userId),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { topicPrefs: true } }),
    db.readingSession.findMany({
      where: { userId, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { textId: true, text: { select: { genre: true, series: true, seriesPart: true } } },
    }),
    db.assignmentRecipient.findMany({
      where: { studentId: userId, completedAt: null, assignment: { kind: "TEXT" } },
      select: { assignment: { select: { textId: true } } },
    }),
    db.enrollment.findMany({ where: { userId }, select: { classId: true } }),
    db.textRating.findMany({ where: { userId }, select: { enjoyment: true, text: { select: { genre: true } } } }),
    db.readingSession.findMany({
      where: { userId, abandonedAt: { not: null }, abandonReason: { in: ["TOO_HARD", "NOT_INTERESTED"] } },
      orderBy: { abandonedAt: "desc" },
      select: { textId: true, abandonReason: true },
    }),
  ]);

  const classmates = enrollments.length
    ? await db.enrollment.findMany({ where: { classId: { in: enrollments.map((e) => e.classId) }, userId: { not: userId } }, select: { userId: true } })
    : [];
  const recs = classmates.length
    ? await db.textRating.groupBy({ by: ["textId"], where: { userId: { in: classmates.map((c) => c.userId) }, recommend: true }, _count: true })
    : [];
  const recsByText = new Map(recs.map((r) => [r.textId, r._count]));

  const completed = new Set(sessions.map((s) => s.textId));
  const recentGenres = new Set(sessions.slice(0, 3).map((s) => s.text.genre));
  const assigned = new Set(assignments.map((a) => a.assignment.textId));
  const prefs = new Set(user.topicPrefs);
  const stopped = new Map<string, "TOO_HARD" | "NOT_INTERESTED">();
  for (const s of stops) if (!stopped.has(s.textId) && !completed.has(s.textId)) stopped.set(s.textId, s.abandonReason as "TOO_HARD" | "NOT_INTERESTED");

  // Genres the student enjoyed (+) or did not (-), from their own ratings.
  const genreTaste = new Map<string, number>();
  for (const r of ratings) genreTaste.set(r.text.genre, (genreTaste.get(r.text.genre) ?? 0) + (r.enjoyment - 2));
  // Narrow reading: the next part of any series the student has started.
  const seriesProgress = new Map<string, number>();
  for (const s of sessions) {
    if (s.text.series) seriesProgress.set(s.text.series, Math.max(seriesProgress.get(s.text.series) ?? 0, s.text.seriesPart ?? 0));
  }

  return texts
    .map((t) => {
      const counts = t.lemmaCounts as LemmaCounts;
      const { coverage, unknownLemmas } = coverageOf(counts, known);
      const recycled = Object.keys(counts).filter((l) => learning.has(l)).length;
      const level = levelFor(coverage);
      const isCompleted = completed.has(t.id);
      const isAssigned = assigned.has(t.id);
      const nextInSeries = !!t.series && !isCompleted && (t.seriesPart ?? 0) === (seriesProgress.get(t.series) ?? -1) + 1;
      const stop = stopped.get(t.id) ?? null;
      const classmateRecs = recsByText.get(t.id) ?? 0;
      const score =
        (level === "locked" ? -100 : 0) +
        (isCompleted ? -20 : 0) +
        (isAssigned ? 10 : 0) +
        (nextInSeries ? 4 : 0) +
        (stop === "NOT_INTERESTED" ? -8 : stop === "TOO_HARD" ? -5 : 0) +
        Math.min(recycled, 8) * 1.5 +
        (t.topics.some((topic) => prefs.has(topic)) ? 3 : 0) +
        (recentGenres.has(t.genre) ? 0 : 2) +
        Math.max(-3, Math.min(3, genreTaste.get(t.genre) ?? 0)) +
        Math.min(classmateRecs, 3);
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
        series: t.series,
        seriesPart: t.seriesPart,
        classmateRecs,
        stopped: stop,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}
