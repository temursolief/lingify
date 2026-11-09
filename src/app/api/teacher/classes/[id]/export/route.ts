import { getSession } from "@/lib/auth";
import { classOverview, teacherClass } from "@/lib/class-overview";

function csvCell(value: string | number | null) {
  const s = value === null ? "" : String(value);
  // Prefix formula-like values so spreadsheets don't execute them.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(_request: Request, ctx: RouteContext<"/api/teacher/classes/[id]/export">) {
  const session = await getSession();
  if (!session || session.role !== "TEACHER") return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const cls = await teacherClass(id, session.userId);
  if (!cls) return new Response("Not found", { status: 404 });

  const rows = await classOverview(cls.id);
  const header = [
    "Name", "Email", "Last active", "Minutes this week", "Reading min (week)", "Comprehension min (week)", "Vocabulary min (week)",
    "Grammar min (week)", "Review min (week)", "Minutes total", "Words read (week)", "Words read (total)", "Texts completed",
    "Known words", "Known words +30 days", "Learning words", "Comprehension % (last 5)", "Avg WPM (last 5)", "Streak days", "Alerts",
  ];
  const lines = rows.map((r) => [
    r.name, r.email, r.lastActiveAt?.toISOString().slice(0, 10) ?? null, r.weekMinutes, r.weekMinutesByActivity.reading,
    r.weekMinutesByActivity.quiz, r.weekMinutesByActivity.vocab, r.weekMinutesByActivity.grammar, r.weekMinutesByActivity.review,
    r.totalMinutes, r.weekWords, r.totalWords, r.textsCompleted, r.knownCount, r.knownGrowth30, r.learningCount, r.comprehension,
    r.avgWpm, r.streak, r.flags.map((f) => `${f.label} (${f.detail})`).join("; "),
  ]);
  const csv = [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\n");
  const filename = `${cls.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
