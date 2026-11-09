import Link from "next/link";
import type { Activity } from "@/generated/prisma/client";
import { ACTIVITY_LABEL, type StudentStats } from "@/lib/stats";
import { formatMinutes } from "@/lib/time";
import { BarList, LineChart, StackedBars, type Series } from "./charts";
import { Card, Stat } from "./ui";

const CHART_ACTIVITIES: Activity[] = ["READING", "QUIZ", "VOCAB", "GRAMMAR", "REVIEW", "FLUENCY"];
const SERIES: Series[] = CHART_ACTIVITIES.map((a, i) => ({ key: a, label: ACTIVITY_LABEL[a], color: `var(--series-${i + 1})` }));

function pct(v: number | null) {
  return v === null ? "–" : `${Math.round(v * 100)}%`;
}

export function StudentStatsView({ stats, readLinks = true }: { stats: StudentStats; readLinks?: boolean }) {
  const daily = stats.daily.map((d) => ({
    day: d.day,
    ...Object.fromEntries(CHART_ACTIVITIES.map((a) => [a, Math.round(d[a] / 60)])),
  }));
  const growth = stats.vocabGrowth.map((v) => ({ day: v.day, value: v.known }));
  const firstKnown = stats.vocabGrowth[0]?.known ?? stats.knownCount;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Time this week" value={formatMinutes(stats.weekSeconds)} hint={`${formatMinutes(stats.totalSeconds)} in total`} />
        <Stat label="Words read" value={stats.wordsRead.toLocaleString()} hint={`${stats.weekWordsRead.toLocaleString()} this week`} />
        <Stat label="Known words" value={stats.knownCount.toLocaleString()} hint={`+${(stats.knownCount - firstKnown).toLocaleString()} in 30 days · ${stats.learningCount} learning`} />
        <Stat label="Reading streak" value={`${stats.streak} day${stats.streak === 1 ? "" : "s"}`} hint={`${stats.textsCompleted} texts finished`} />
      </div>

      <Card>
        <h2 className="font-semibold">Minutes per day, by activity</h2>
        <p className="mb-4 text-sm text-muted">Last 30 days. Only active time counts: the timer pauses when the page is hidden or idle.</p>
        <StackedBars data={daily} series={SERIES} label="Minutes per day by activity" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Known vocabulary</h2>
          <p className="mb-4 text-sm text-muted">Words you know, last 30 days</p>
          <LineChart data={growth} label="Known words" />
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Time by activity</h2>
          <BarList
            unit=" min"
            items={CHART_ACTIVITIES.map((a, i) => ({ label: ACTIVITY_LABEL[a], value: Math.round(stats.totalByActivity[a] / 60), color: `var(--series-${i + 1})` }))}
          />
          <p className="mt-4 text-sm text-muted">This week: {CHART_ACTIVITIES.map((a) => `${ACTIVITY_LABEL[a]} ${Math.round(stats.weekByActivity[a] / 60)} min`).join(" · ")}</p>
        </Card>
        <Card>
          <h2 className="font-semibold">Reading speed</h2>
          <p className="mb-4 text-sm text-muted">Words per minute for each text you finished</p>
          <LineChart data={stats.wpmTrend} unit=" wpm" label="Words per minute" />
        </Card>
        <Card>
          <h2 className="font-semibold">Understanding</h2>
          <p className="mb-4 text-sm text-muted">Comprehension score for each text (first try)</p>
          <LineChart data={stats.comprehensionTrend} unit="%" label="Comprehension score" />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Accuracy by exercise</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {([["Comprehension", stats.accuracy.comprehension], ["Vocabulary", stats.accuracy.vocab], ["Grammar", stats.accuracy.grammar], ["Word review", stats.accuracy.review]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-paper p-3">
                <dt className="text-muted">{k}</dt>
                <dd className="text-xl font-semibold tabular-nums">{pct(v)}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Recent reading</h2>
          {stats.recentSessions.length === 0 ? (
            <p className="text-sm text-muted">No texts finished yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {stats.recentSessions.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  {readLinks ? (
                    <Link href={`/student/read/${s.text.slug}`} className="truncate hover:underline">{s.text.title}</Link>
                  ) : (
                    <span className="truncate">{s.text.title}</span>
                  )}
                  <span className="whitespace-nowrap text-muted tabular-nums">
                    {s.wpm ? `${Math.round(s.wpm)} wpm` : "–"} · {s.quizScore !== null ? `${Math.round(s.quizScore * 100)}%` : "no quiz"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
