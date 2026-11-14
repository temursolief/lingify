import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Castle } from "@/components/castle";
import { ErrorBreakdownView } from "@/components/error-breakdown";
import { Fire, LockKey, MagnifyingGlass, Cards, Target, type Icon } from "@/components/icons";
import { Card, PageHeader, PageSkeleton, ProgressBar, SectionTitle, cx } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { skillBadges } from "@/lib/badges";
import { db } from "@/lib/db";
import { fortressOf, STAGES, xpForLevel } from "@/lib/fortress";
import { studentGame } from "@/lib/gamification";
import { fmtXp, IDLE_CAP_DAYS, REAL_DAY_CARDS, XP, XP_LOSS } from "@/lib/xp";
import { errorBreakdown } from "@/lib/insights";
import { ERROR_TAG_LABEL } from "@/lib/passages";
import { skillBands, type SkillBand } from "@/lib/skills";
import { formatDay } from "@/lib/time";

export const metadata: Metadata = { title: "Journey" };

const BADGE_ICON: Record<string, Icon> = { evidence: MagnifyingGlass, distractor: Target, flame: Fire, exam: LockKey, words: Cards };
const TAG_ORDER = ["DISTRACTOR", "LOGIC", "VOCAB", "CARELESS"] as const;
const TAG_COLOR = { DISTRACTOR: "var(--accent)", LOGIC: "var(--color-accent-600)", VOCAB: "var(--color-accent-700)", CARELESS: "var(--color-neutral-600)" };

function BandTile({ name, skill, target }: { name: string; skill: SkillBand; target: number }) {
  const d = skill.delta;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-3.5">
      <span className="text-xs text-muted">{name}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[28px] font-medium tabular-nums">{skill.band !== null ? skill.band.toFixed(1) : "–"}</span>
        {d !== null && <span className={cx("text-xs", d > 0 ? "text-good" : "text-muted")}>{d > 0 ? `+${d.toFixed(1)}` : d < 0 ? d.toFixed(1) : "±0"}</span>}
      </div>
      <ProgressBar value={(skill.band ?? 0) / target} label={`${name} band towards target`} />
      <span className="text-[11px] text-faint">{skill.tries ? `from ${skill.tries} first tr${skill.tries === 1 ? "y" : "ies"}` : "no first tries yet"}</span>
    </div>
  );
}

async function JourneyContent() {
  const user = await requireStudent();
  const gameP = studentGame(user.id);
  // Everything at once: no query waits for another.
  const [game, bands, breakdown, history, badges] = await Promise.all([
    gameP,
    skillBands(user.id),
    errorBreakdown([user.id]),
    db.$queryRaw<{ id: string; firstCorrect: number | null; total: number; band: number | null; firstSubmittedAt: Date; title: string; slug: string }[]>`
      SELECT a.id, a."firstCorrect", a.total, a.band, a."firstSubmittedAt", p.title, p.slug
      FROM "PassageAttempt" a JOIN "Passage" p ON p.id = a."passageId"
      WHERE a."userId" = ${user.id} AND a."invalidatedAt" IS NULL AND a."firstSubmittedAt" IS NOT NULL
      ORDER BY a."firstSubmittedAt" DESC LIMIT 10`.then((rows) => rows.map((r) => ({ ...r, passage: { title: r.title, slug: r.slug } }))),
    skillBadges(
      user.id,
      gameP.then((g) => g.bestStreak),
    ),
  ]);
  const fortress = fortressOf(game.xp);
  const band = bands.reading.band ?? bands.listening.band;
  const tagged = Object.values(breakdown.tags).reduce((a, b) => a + b, 0);
  const headline = breakdown.headline;

  return (
    <>
      <PageHeader
        kicker="Journey"
        title={`${band !== null ? band.toFixed(1) : "–"} → ${user.targetBand.toFixed(1)}`}
        subtitle={
          <>
            Estimated from your first tries. Level {game.level} · {fmtXp(game.xp)} XP · {fmtXp(game.levelTo - game.xp)} XP to level {game.level + 1} ·{" "}
            <Link href="/student/settings">change goal</Link>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))]">
          <BandTile name="Reading" skill={bands.reading} target={user.targetBand} />
          <BandTile name="Listening" skill={bands.listening} target={user.targetBand} />
          <div className="flex flex-col gap-2 rounded-lg bg-surface p-3.5">
            <span className="text-xs text-muted">Streak</span>
            <span className="text-[28px] font-medium tabular-nums">{game.streak}</span>
            <span className="text-[11px] text-faint">best {game.bestStreak} · {game.shields} shield{game.shields === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-col gap-2 rounded-lg bg-surface p-3.5">
            <span className="text-xs text-muted">This week</span>
            <span className="text-[28px] font-medium tabular-nums">{fmtXp(game.weekXp)}</span>
            <span className="text-[11px] text-faint">XP from honest work</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <SectionTitle title="Fortress stages" note={`${fortress.stage + 1} of ${STAGES.length} built · a built stage always stands`} />
          <ol className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
            {STAGES.map((st, i) => {
              const built = i <= fortress.stage;
              const current = i === fortress.stage;
              return (
                <li
                  key={st.key}
                  className={cx(
                    "flex flex-col items-center gap-1 rounded-lg border p-2 text-center",
                    current ? "border-accent bg-surface shadow-lifted" : built ? "border-line bg-surface" : "border-dashed border-[var(--color-neutral-700)]",
                  )}
                >
                  <Castle stage={i} ghost={!built} streak={current ? game.streak : 0} className="w-full max-w-[120px]" />
                  <span className="caps text-[13px]">{st.name}</span>
                  <span className="text-[11px] text-muted tabular-nums">
                    {current ? "You are here" : built ? "Built" : `Lv ${st.level} · ${fmtXp(xpForLevel(st.level) - game.xp)} XP to go`}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <section id="xp" className="flex scroll-mt-6 flex-col gap-2.5">
          <SectionTitle title="How XP is earned and lost" note="effort counts, speed does not" />
          <div className="grid gap-x-6 gap-y-2 rounded-xl border border-line bg-surface p-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
            {[
              [`+${XP.correct}`, "Each answer right at your first try of a passage or lesson, done honestly. Only your first try at each one counts."],
              [`+${XP.proof}`, "A red answer fixed with its proof in the right paragraph."],
              [`+${XP.proofElsewhere}`, "Fixed, but the proof was in another paragraph."],
              [`+${fmtXp(XP.tag)}`, "Saying why you missed an answer."],
              [`+${fmtXp(XP.card)}`, "Each flashcard you take time over. Rushed cards earn nothing."],
              [`+${XP.homework}`, "A piece of homework finished, words included."],
            ].map(([xp, text]) => (
              <div key={text} className="flex items-baseline gap-3">
                <span className="w-10 shrink-0 font-display text-lg font-bold text-olive tabular-nums">{xp}</span>
                <span className="text-[13px] text-soft">{text}</span>
              </div>
            ))}
            {[
              [`−${XP_LOSS.idleDay}`, "A day with no real action (a proof, a first try or 10 cards). A shield saves the streak and spares this."],
              [`−${XP_LOSS.noWords}`, "A day with no flashcards reviewed. Words are owed every day, shield or not."],
              [`−${XP_LOSS.leftTest}`, "A test you walked out of: leaving the tab, the window or fullscreen ends it."],
            ].map(([xp, text]) => (
              <div key={text} className="flex items-baseline gap-3">
                <span className="w-10 shrink-0 font-display text-lg font-bold text-accent tabular-nums">{xp}</span>
                <span className="text-[13px] text-soft">{text}</span>
              </div>
            ))}
            <p className="text-xs text-muted [grid-column:1/-1]">
              Flagged attempts earn nothing. Finish all three daily quests to earn a shield (you can hold two). Penalties stop after {IDLE_CAP_DAYS} days in a row away, and they can never take you below where your current stage began: a castle you built stays standing.
              Your streak needs one real action a day ({REAL_DAY_CARDS} cards, a proof or a first try).
            </p>
          </div>
        </section>

        <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
          <Card className="flex flex-col gap-3 p-[18px]">
            <span className="kicker">Biggest bottleneck</span>
            {headline ? (
              <span className="text-[19px] font-medium">
                {Math.round(headline.share * 100)}% of your mistakes are {ERROR_TAG_LABEL[headline.tag].title.toLowerCase()} in {headline.label}.
              </span>
            ) : (
              <span className="text-[17px] font-medium">{breakdown.passages ? "No pattern yet. Tag why you missed answers to see one." : "Finish a passage to see what causes your mistakes."}</span>
            )}
            {tagged > 0 && (
              <div className="flex flex-col gap-2">
                {TAG_ORDER.map((t) => {
                  const pct = Math.round((breakdown.tags[t] / tagged) * 100);
                  return (
                    <div key={t} className="grid grid-cols-[96px_1fr_36px] items-center gap-2.5 text-xs">
                      <span className="text-soft">{ERROR_TAG_LABEL[t].title.split(" / ")[0]}</span>
                      <div className="h-2 rounded bg-grid">
                        <div className="h-full rounded" style={{ width: `${pct}%`, background: TAG_COLOR[t] }} />
                      </div>
                      <span className="text-right text-muted tabular-nums">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
            <Link
              href="/student/practice"
              className="caps inline-flex items-center gap-1.5 self-start rounded-md bg-accent px-3.5 py-2 text-white no-underline shadow-[inset_0_-3px_0_var(--accent-shade)] hover:bg-accent-hover hover:text-white hover:no-underline"
            >
              <Target size={16} aria-hidden />
              Practise with a passage
            </Link>
          </Card>

          <div className="flex flex-col gap-2.5">
            <SectionTitle title="Skill badges" />
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
              {badges.map((b) => {
                const I = BADGE_ICON[b.icon];
                const locked = b.level === 0;
                return (
                  <div key={b.key} className={cx("flex flex-col gap-1.5 rounded-lg border bg-surface p-3", locked ? "border-dashed border-line opacity-60" : "border-brass")}>
                    <I size={26} weight={locked ? "regular" : "fill"} className={locked ? "text-muted" : "text-brass"} aria-hidden />
                    <span className="text-[13px] font-medium">{b.name}</span>
                    <span className="text-[11px] text-muted">{b.desc}</span>
                    <span className="text-[11px] text-[var(--color-accent-300)] tabular-nums">
                      {locked ? "Locked" : `Level ${b.level}`} · {b.count} / {b.goal}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {history.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <SectionTitle title="First tries" note="the exam-like score for each passage" />
            <ul className="overflow-hidden rounded-lg bg-surface">
              {history.map((a) => (
                <li key={a.id} className="border-b border-line last:border-0">
                  <Link href={`/student/passages/${a.passage.slug}`} className="flex items-center gap-4 px-3.5 py-2.5 text-ink no-underline hover:bg-hover hover:no-underline">
                    <span className="min-w-0 flex-1 truncate">{a.passage.title}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {a.firstCorrect}/{a.total} · band {a.band} · {formatDay(a.firstSubmittedAt!)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {breakdown.mistakes > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-[13px] text-[var(--color-accent-400)] select-none">Every mistake, by type and cause</summary>
            <div className="mt-4 max-w-3xl">
              <ErrorBreakdownView data={breakdown} />
            </div>
          </details>
        )}
      </div>
    </>
  );
}

export default function JourneyPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JourneyContent />
    </Suspense>
  );
}
