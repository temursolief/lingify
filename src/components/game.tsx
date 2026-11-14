import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { fortressOf, rivalLine, STAGES, type Fortress } from "@/lib/fortress";
import { fmtXp, XP_LOSS } from "@/lib/xp";
import type { ClassGame, Game, LeagueRow } from "@/lib/gamification";
import type { HomeworkItem } from "@/lib/today";
import { formatDay } from "@/lib/time";
import type { Quest } from "@/lib/xp";
import { Castle } from "./castle";
import { ArrowRight, BookOpenText, Cards, CheckCircle, Crown, Fire, Headphones, Lightning, LockSimple, MagnifyingGlass, ShieldCheck, UsersThree, Warning } from "./icons";
import { Badge, ButtonLink, ProgressBar, cx, type Tone } from "./ui";

/** A small cream chip with an icon, a number and a word. */
export function StatChip({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5">
      {icon}
      <span className="font-display text-[17px] font-bold tabular-nums">{value}</span>
      <span className="caps text-[11px] text-muted">{label}</span>
    </div>
  );
}

/**
 * The hero of Today: the student's fortress, its stage and level, the bar to the next stage and the next three
 * stages as locked outlines, so the next thing to build is always in sight.
 */
export function FortressCard({ game, crowns }: { game: Game; crowns: number }) {
  const f = fortressOf(game.xp);
  const next = f.ahead[0];
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label="Your fortress">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:p-5">
        <Castle stage={f.stage} streak={game.streak} shields={game.shields} crowns={crowns} title={`Your ${f.current.name}`} className="w-[min(100%,260px)] shrink-0" />
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-2">
          <span className="kicker">Your fortress · stage {f.stage + 1} of {STAGES.length}</span>
          <h2 className="text-[30px] leading-none uppercase sm:text-[36px]">{f.current.name}</h2>
          <p className="text-sm text-soft">{f.current.blurb}</p>
          <div className="mt-1 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="caps text-[12px]">
                Level {game.level} · {fmtXp(game.xp)} XP
              </span>
              <span className="text-xs text-muted tabular-nums">
                {fmtXp(game.levelTo - game.xp)} XP to level {game.level + 1}
              </span>
            </div>
            <ProgressBar value={(game.xp - game.levelFrom) / (game.levelTo - game.levelFrom)} label="Level progress" className="h-2" />
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            <StatChip icon={<Fire size={16} weight="fill" className={game.todayDone ? "text-flame" : "text-faint"} aria-hidden />} value={game.streak} label={game.todayDone ? "day streak" : "light it today"} />
            <StatChip icon={<ShieldCheck size={16} weight="fill" className="text-olive" aria-hidden />} value={game.shields} label={game.shields === 1 ? "shield" : "shields"} />
            {crowns > 0 && <StatChip icon={<Crown size={16} weight="fill" className="text-gold" aria-hidden />} value={crowns} label={crowns === 1 ? "crown" : "crowns"} />}
            <StatChip icon={<Lightning size={16} weight="fill" className="text-accent" aria-hidden />} value={game.todayXp > 0 ? `+${fmtXp(game.todayXp)}` : fmtXp(game.todayXp)} label="XP today" />
          </div>
        </div>
      </div>
      <OwedNote game={game} />
      {next && (
        <div className="border-t border-line bg-[color-mix(in_srgb,var(--page)_55%,var(--surface))] px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="caps text-[12px]">Next to build</span>
            <span className="text-xs text-muted">{Math.round(f.toNext * 100)}% of the way to the {next.name}</span>
          </div>
          <StageStrip ahead={f.ahead} />
        </div>
      )}
    </section>
  );
}

/**
 * What today will cost if left undone, and what yesterday cost: the other half of the game. Shown only when there is
 * something to say, so a student who is on top of it sees nothing.
 */
function OwedNote({ game }: { game: Game }) {
  const { owed, yesterday } = game;
  const lines: string[] = [];
  if (yesterday) {
    const why = [yesterday.idle ? "no real action" : null, yesterday.noWords ? "no flashcards" : null].filter(Boolean).join(" and ");
    lines.push(`Yesterday cost you ${fmtXp(-yesterday.xp)} XP${why ? `: ${why}` : ""}.`);
  }
  if (owed.streak) {
    lines.push(owed.shieldCovers ? "No real action yet today: a shield will save your streak at midnight, but a day with none costs a shield." : `No real action yet today: ${XP_LOSS.idleDay} XP and your streak are lost at midnight.`);
  }
  if (owed.words) lines.push(`No flashcards yet today: ${XP_LOSS.noWords} XP lost at midnight.`);
  if (!lines.length) return null;
  const urgent = owed.streak && !owed.shieldCovers;
  return (
    <ul className={cx("flex flex-col gap-1 border-t px-4 py-3 text-[13px] font-semibold sm:px-5", urgent ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-warn-soft text-warn")}>
      {lines.map((l) => (
        <li key={l} className="flex items-start gap-2">
          <Warning size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {l}
        </li>
      ))}
    </ul>
  );
}

/** The next stages as pale outlines with the XP each still needs. */
export function StageStrip({ ahead }: { ahead: Fortress["ahead"] }) {
  return (
    <ol className="grid grid-cols-3 gap-2">
      {ahead.map((s, i) => (
        <li key={s.key} className={cx("flex flex-col items-center gap-1 rounded-lg border border-dashed border-[var(--color-neutral-700)] px-2 py-2 text-center", i === 0 && "border-solid border-accent bg-surface")}>
          <Castle stage={s.index} ghost={i > 0} className={cx("w-full max-w-[110px]", i === 0 && "opacity-60 grayscale-[60%]")} />
          <span className="caps flex items-center gap-1 text-[12px]">
            {i > 0 && <LockSimple size={11} weight="bold" aria-hidden />}
            {s.name}
          </span>
          <span className="text-[11px] text-muted tabular-nums">
            Lv {s.level} · {fmtXp(s.xpLeft)} XP
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The weekly league, made personal: the podium of the top three with their castles, your rank, and the one line that
 * says how far to the next person. Only for classes whose teacher keeps the league on.
 */
export function LeagueCard({ cls }: { cls: ClassGame }) {
  const me = cls.league.find((r) => r.you);
  const line = rivalLine(cls.league);
  return (
    <Link href="/student/class" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-ink no-underline hover:border-accent hover:text-ink hover:no-underline">
      <div className="flex items-baseline justify-between gap-2">
        <span className="caps text-[17px]">This week&apos;s league</span>
        <span className="text-xs text-muted">
          {cls.daysLeft} day{cls.daysLeft === 1 ? "" : "s"} left
        </span>
      </div>
      <Podium rows={cls.league} compact />
      {me && (
        <div className={cx("rounded-md px-3 py-2 text-[13px] font-semibold", line.kind === "lead" ? "bg-good-soft text-good" : "bg-accent-soft text-accent-ink")}>
          You&apos;re #{cls.rank} · {line.text}
        </div>
      )}
      <span className="text-xs text-muted">Finish the week first to win a crown for your fortress.</span>
    </Link>
  );
}

/** First, second and third: the winner in the middle and tallest, each with their castle and crowns. */
export function Podium({ rows, compact = false }: { rows: LeagueRow[]; compact?: boolean }) {
  const top = rows.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const height = { 0: compact ? "h-14" : "h-20", 1: compact ? "h-10" : "h-14", 2: compact ? "h-7" : "h-10" } as Record<number, string>;
  return (
    <div className="grid grid-cols-3 items-end gap-2" role="list" aria-label="Top three this week">
      {order.map((r, slot) => {
        if (!r) return <span key={`empty${slot}`} />;
        const place = rows.indexOf(r);
        return (
          <div key={r.id} role="listitem" className="flex min-w-0 flex-col items-center gap-1">
            <Castle stage={r.stage} crowns={r.crowns} className={cx(compact ? "w-[72px]" : "w-[110px]", "max-w-full")} title={`${r.name}'s ${STAGES[r.stage]!.name}`} />
            <span className={cx("max-w-full truncate text-center text-[13px] font-semibold", r.you && "text-accent-ink")}>
              {r.you ? "You" : r.name.split(/\s+/)[0]}
            </span>
            <span className="text-[11px] text-muted tabular-nums">{fmtXp(r.xp)} XP</span>
            <div
              className={cx(
                "flex w-full items-start justify-center rounded-t-md pt-1 font-display text-lg font-bold text-white",
                height[place],
                place === 0 ? "bg-gold" : place === 1 ? "bg-[#a8966a]" : "bg-[#c0632f]",
              )}
            >
              {place + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The one next step: the title, why it was chosen, the XP it is worth and one solid button. */
export function NextUpCard({ title, why, href, cta, xp }: { title: string; why: string; href: string; cta: string; xp: number | null }) {
  return (
    <div className="band flex flex-wrap items-center gap-4 rounded-xl bg-section p-5 sm:p-[22px]">
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5">
        <span className="kicker text-[var(--color-accent-300)]">Next mission · chosen for you</span>
        <span className="font-display text-[22px] leading-tight font-bold sm:text-[26px]">{title}</span>
        <span className="text-[13px] text-soft">{why}</span>
      </div>
      <div className="flex items-center gap-3">
        {xp !== null && <span className="font-display text-lg font-bold text-gold">up to +{fmtXp(xp)} XP</span>}
        <ButtonLink href={href}>
          {cta}
          <ArrowRight size={16} weight="bold" aria-hidden />
        </ButtonLink>
      </div>
    </div>
  );
}

const QUEST_ICON = { proofs: MagnifyingGlass, cards: Cards, first: BookOpenText } as const;

export function QuestList({ quests }: { quests: Quest[] }) {
  return (
    <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface px-3.5 py-1">
      {quests.map((q) => {
        const I = q.done ? CheckCircle : QUEST_ICON[q.key];
        return (
          <div key={q.key} className="flex items-center gap-3 py-2.5">
            <I size={22} weight={q.done ? "fill" : "duotone"} className={q.done ? "text-olive" : "text-accent"} aria-hidden />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="flex justify-between gap-2">
                <span className={cx("text-sm font-semibold", q.done && "text-muted line-through")}>{q.title}</span>
                <span className="text-xs text-muted tabular-nums">
                  {q.count} / {q.goal}
                </span>
              </div>
              <ProgressBar value={q.count / q.goal} tone={q.done ? "good" : "accent"} label={q.title} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Five steps of half a band up to the target, with the current band ringed. */
export function BandPath({ band, target, href }: { band: number | null; target: number; href: string }) {
  const steps = [0, 1, 2, 3, 4].map((i) => target - 2 + i * 0.5);
  const at = band === null ? -1 : steps.reduce((best, s, i) => (band >= s ? i : best), -1);
  return (
    <Link href={href} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5 text-ink no-underline hover:border-accent hover:text-ink hover:no-underline">
      <div className="flex justify-between">
        <span className="caps text-[13px]">Band objective</span>
        <span className="text-xs text-muted">
          {band === null ? "finish a first try for your band" : `${band.toFixed(1)} now`} → {target.toFixed(1)} goal
        </span>
      </div>
      <div className="flex items-center" aria-hidden>
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <span
              className={cx("block shrink-0 rounded-full", i === at ? "h-3.5 w-3.5" : "h-2.5 w-2.5", i <= at ? "bg-accent" : "bg-[var(--color-neutral-700)]")}
              style={{ boxShadow: i === at ? "0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent)" : i === 4 ? "0 0 0 1px var(--color-accent-400)" : undefined }}
            />
            {i < 4 && <span className={cx("h-0.5 flex-1", i < at ? "bg-accent" : "bg-[var(--color-neutral-800)]")} />}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted">
        {steps.map((s, i) => (
          <span key={s} className={cx(i === at && "text-[var(--color-accent-300)]")}>
            {s.toFixed(1)}
          </span>
        ))}
      </div>
    </Link>
  );
}

const STATE: Record<HomeworkItem["state"], { tag: string; tone: Tone }> = {
  todo: { tag: "Not started", tone: "neutral" },
  started: { tag: "In progress", tone: "accent" },
  correcting: { tag: "In progress", tone: "accent" },
  words: { tag: "Key words", tone: "warn" },
  done: { tag: "Done", tone: "good" },
};

function homeworkMeta(h: HomeworkItem) {
  const kind = h.kind === "reading" ? "Reading" : "Listening";
  const step =
    h.state === "done"
      ? `complete${h.band !== null ? ` · band ${h.band}` : ""}`
      : h.state === "correcting"
        ? h.left
          ? `${h.left} correction${h.left === 1 ? "" : "s"} left`
          : "say why you missed them"
        : h.state === "words"
          ? "study the key words"
          : h.state === "started"
            ? "first try under way"
            : `${h.total} questions`;
  const due = h.state !== "done" && h.dueAt ? ` · due ${formatDay(h.dueAt, true)}` : "";
  return `${kind} · ${step}${due}`;
}

export function HomeworkRow({ h, now }: { h: HomeworkItem; now: Date }) {
  const overdue = h.state !== "done" && h.dueAt && h.dueAt < now;
  const s = overdue ? { tag: "Overdue", tone: "bad" as const } : STATE[h.state];
  const I = h.kind === "reading" ? BookOpenText : Headphones;
  return (
    <Link
      href={h.href}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-ink no-underline shadow-[inset_4px_0_0_var(--edge)] hover:border-accent hover:text-ink hover:no-underline"
      style={{ "--edge": h.state === "done" ? "var(--olive)" : overdue ? "var(--accent)" : "var(--brass)" } as CSSProperties}
    >
      <I size={22} weight="duotone" className="ml-1 shrink-0 text-accent" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold">{h.title}</span>
        <span className="truncate text-xs text-muted">{homeworkMeta(h)}</span>
      </span>
      <Badge tone={s.tone}>{s.tag}</Badge>
    </Link>
  );
}

export function ClassGoalBar({ game }: { game: ClassGame }) {
  return (
    <Link
      href="/student/class"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3.5 text-ink no-underline hover:border-accent hover:text-ink hover:no-underline"
    >
      <UsersThree size={22} weight="duotone" className="text-navy" aria-hidden />
      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
        <span className="text-[13px]">
          Class goal: <b className="font-semibold">{fmtXp(game.goal)} XP together by Sunday</b>
          {game.leagueEnabled && game.rank > 0 && <> · you&apos;re #{game.rank} in the league</>}
        </span>
        <ProgressBar value={game.weekXp / game.goal} tone="good" label="Class goal" className="h-2" />
      </div>
      <span className="text-xs text-muted tabular-nums">
        {fmtXp(game.weekXp)} / {fmtXp(game.goal)}
      </span>
    </Link>
  );
}
