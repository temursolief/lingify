import Link from "next/link";
import type { ReactNode } from "react";
import type { ClassGame } from "@/lib/gamification";
import type { HomeworkItem } from "@/lib/today";
import { formatDay } from "@/lib/time";
import type { Quest } from "@/lib/xp";
import { ArrowRight, BookOpenText, Cards, CheckCircle, Headphones, MagnifyingGlass, UsersThree } from "./icons";
import { Badge, ProgressBar, cx, type Tone } from "./ui";

/** A small surface chip with an icon, a number and a word: the streak, XP and shields at the top of Today. */
export function StatChip({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5">
      {icon}
      <span className="font-medium tabular-nums">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

/** The one next step: a soft accent gradient, the title, why it was chosen, the XP it is worth and one outlined button. */
export function NextUpCard({ title, why, href, cta, xp }: { title: string; why: string; href: string; cta: string; xp: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl bg-[linear-gradient(120deg,var(--color-accent-900),var(--surface)_70%)] p-5 shadow-[0_0_0_1px_var(--color-accent-800)] sm:p-[22px]">
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5">
        <span className="text-[11px] tracking-[0.1em] text-[var(--color-accent-300)] uppercase">Next up · chosen for you</span>
        <span className="text-xl font-medium sm:text-[22px]">{title}</span>
        <span className="text-[13px] text-soft">{why}</span>
      </div>
      <div className="flex items-center gap-3">
        {xp !== null && <span className="text-[13px] text-[var(--color-accent-300)]">+{xp} XP</span>}
        <Link
          href={href}
          className="inline-flex items-center gap-2 rounded-md border border-accent px-[18px] py-2.5 font-medium text-[var(--color-accent-300)] no-underline hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] hover:no-underline"
        >
          {cta}
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

const QUEST_ICON = { proofs: MagnifyingGlass, cards: Cards, first: BookOpenText } as const;

export function QuestList({ quests }: { quests: Quest[] }) {
  return (
    <div className="flex flex-col rounded-lg bg-surface px-3.5 py-1.5">
      {quests.map((q) => {
        const I = q.done ? CheckCircle : QUEST_ICON[q.key];
        return (
          <div key={q.key} className="flex items-center gap-3 py-2.5">
            <I size={20} weight={q.done ? "fill" : "regular"} className={q.done ? "text-good" : "text-[var(--color-accent-400)]"} aria-hidden />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-[13px]">{q.title}</span>
                <span className="text-xs text-muted tabular-nums">
                  {q.count} / {q.goal}
                </span>
              </div>
              <ProgressBar value={q.count / q.goal} label={q.title} />
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
    <Link href={href} className="flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 text-ink no-underline hover:shadow-[0_0_0_1px_var(--color-accent-700)] hover:no-underline">
      <div className="flex justify-between">
        <span className="text-[13px]">Band path</span>
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
      className="flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3 text-ink no-underline hover:shadow-[0_0_0_1px_var(--color-accent-700)] hover:no-underline"
    >
      <I size={22} className="shrink-0 text-[var(--color-accent-400)]" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{h.title}</span>
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
      className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3.5 text-ink no-underline hover:border-[var(--color-accent-600)] hover:no-underline"
    >
      <UsersThree size={22} className="text-[var(--color-accent-400)]" aria-hidden />
      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
        <span className="text-[13px]">
          Class goal: <b className="font-medium">{game.goal.toLocaleString("en-US")} XP together by Sunday</b>
          {game.leagueEnabled && game.rank > 0 && <> · you&apos;re #{game.rank} in the league</>}
        </span>
        <ProgressBar value={game.weekXp / game.goal} label="Class goal" className="h-1.5" />
      </div>
      <span className="text-xs text-muted tabular-nums">
        {game.weekXp.toLocaleString("en-US")} / {game.goal.toLocaleString("en-US")}
      </span>
    </Link>
  );
}
