"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, use, type ReactNode } from "react";
import {
  ArrowLeft,
  Books,
  Cards,
  ChalkboardTeacher,
  Fire,
  GearSix,
  House,
  Path,
  Tray,
  UsersThree,
  type Icon,
} from "./icons";
import { cx } from "./ui";

const ICONS = { today: House, practice: Books, words: Cards, journey: Path, class: UsersThree, inbox: Tray, classes: ChalkboardTeacher, settings: GearSix } satisfies Record<
  string,
  Icon
>;

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: keyof typeof ICONS;
  /** other paths that belong to this tab, e.g. a passage page belongs to Practice */
  also?: string[];
};

export type NavBadges = Record<string, number>;
export type NavPerson = { name: string; kicker: string; hud?: { level: number; stage: string; pct: number; streak: number; lit: boolean } };

/** The tab a path belongs to: the longest matching href (so "/student" only matches itself). */
function activeKey(pathname: string, items: NavItem[], home: string) {
  let best: { key: string; len: number } | null = null;
  for (const item of items) {
    for (const href of [item.href, ...(item.also ?? [])]) {
      const hit = href === home ? pathname === home : pathname === href || pathname.startsWith(href + "/");
      if (hit && (!best || href.length > best.len)) best = { key: item.key, len: href.length };
    }
  }
  return best?.key ?? null;
}

/** One step up: a section's page goes back to its list, a list back home. Paths without a page of their own are skipped. */
function parentOf(pathname: string, home: string) {
  const parts = pathname.split("/").filter(Boolean);
  do parts.pop();
  while (parts.length && parts.at(-1) === "students");
  const parent = "/" + parts.join("/");
  return parent.length < home.length ? home : parent;
}

function Badge({ badges, k, tab }: { badges: Promise<NavBadges>; k: string; tab?: boolean }) {
  const n = use(badges)[k];
  if (!n) return null;
  return tab ? (
    <span className="absolute -top-0.5 left-1/2 ml-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">{n > 99 ? "99+" : n}</span>
  ) : (
    <span className="min-w-5 rounded-[4px] bg-accent px-1.5 text-center text-[11px] leading-[18px] font-semibold text-white tabular-nums">{n}</span>
  );
}

function Person({ person }: { person: Promise<NavPerson> }) {
  const p = use(person);
  return (
    <>
      <span className="kicker">{p.kicker}</span>
      <span className="truncate font-display text-[17px] font-bold">{p.name}</span>
      {p.hud && (
        <span className="mt-2 flex flex-col gap-1">
          <span className="flex items-center justify-between text-[11px]">
            <span className="caps text-gold">
              Lv {p.hud.level} · {p.hud.stage}
            </span>
            <span className={cx("flex items-center gap-0.5 font-semibold tabular-nums", p.hud.lit ? "text-[#e07a5f]" : "text-muted")} title="Day streak">
              <Fire size={12} weight="fill" aria-hidden />
              {p.hud.streak}
            </span>
          </span>
          <span className="block h-1.5 overflow-hidden rounded-[2px] bg-grid" role="progressbar" aria-label="Level progress" aria-valuenow={Math.round(p.hud.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span className="block h-full bg-gold" style={{ width: `${Math.round(p.hud.pct * 100)}%` }} />
          </span>
        </span>
      )}
    </>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="grid h-[26px] w-[26px] place-items-center rounded-[5px] bg-accent font-display text-[15px] font-bold text-white shadow-[inset_0_-2px_0_var(--accent-shade)]">
        L
      </span>
      <span className="font-display text-[19px] font-bold tracking-[0.08em] uppercase">Lingify</span>
    </span>
  );
}

function SideLinks({ items, current, badges }: { items: NavItem[]; current: string | null; badges: Promise<NavBadges> }) {
  return items.map((item) => {
    const active = current === item.key;
    const I = ICONS[item.icon];
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex items-center gap-2.5 rounded-md border-l-[3px] px-2.5 py-2 font-semibold no-underline transition-colors hover:no-underline",
          active ? "border-gold bg-hover text-white hover:text-white" : "border-transparent text-soft hover:bg-hover hover:text-ink",
        )}
      >
        <I size={18} weight={active ? "fill" : "regular"} aria-hidden />
        <span className="flex-1">{item.label}</span>
        <Suspense fallback={null}>
          <Badge badges={badges} k={item.key} />
        </Suspense>
      </Link>
    );
  });
}

function TabLinks({ items, current, badges }: { items: NavItem[]; current: string | null; badges: Promise<NavBadges> }) {
  return items.map((item) => {
    const active = current === item.key;
    const I = ICONS[item.icon];
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 border-t-[3px] no-underline hover:no-underline",
          active ? "border-accent text-accent hover:text-accent" : "border-transparent text-muted hover:text-ink",
        )}
      >
        <I size={22} weight={active ? "fill" : "regular"} aria-hidden />
        <span className="caps text-[11px]">{item.label}</span>
        <Suspense fallback={null}>
          <Badge badges={badges} k={item.key} tab />
        </Suspense>
      </Link>
    );
  });
}

function SettingsLink({ href, active }: { href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-2.5 rounded-md border-l-[3px] px-2.5 py-2 font-semibold no-underline hover:no-underline",
        active ? "border-gold bg-hover text-white hover:text-white" : "border-transparent text-muted hover:bg-hover hover:text-ink",
      )}
    >
      <GearSix size={18} aria-hidden />
      Settings
    </Link>
  );
}

type Frame = { home: string; items: NavItem[]; badges: Promise<NavBadges>; settingsHref: string };

/** The parts that depend on the address: they stream in after the frame, so the frame itself can be prerendered. */
function ActiveSide({ home, items, badges }: Frame) {
  return <SideLinks items={items} current={activeKey(usePathname(), items, home)} badges={badges} />;
}

function ActiveTabs({ home, items, badges }: Frame) {
  return <TabLinks items={items} current={activeKey(usePathname(), items, home)} badges={badges} />;
}

function ActiveSettings({ settingsHref }: Frame) {
  return <SettingsLink href={settingsHref} active={usePathname() === settingsHref} />;
}

function TopBar({ home, settingsHref, deep }: { home: string; settingsHref: string; deep: string | null }) {
  return (
    <header className={cx("band flex h-12 shrink-0 items-center gap-1 border-b-[3px] border-accent bg-bar px-2", !deep && "md:hidden")}>
      {deep ? (
        <Link href={deep} aria-label="Back" className="flex h-10 items-center gap-1.5 rounded-md px-2 font-semibold text-accent-ink no-underline hover:bg-accent-soft hover:no-underline">
          <ArrowLeft size={18} aria-hidden />
          <span className="text-sm">Back</span>
        </Link>
      ) : (
        <Link href={home} className="px-2 text-ink no-underline hover:no-underline md:hidden">
          <Brand />
        </Link>
      )}
      <Link href={settingsHref} aria-label="Settings" className="ml-auto flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink md:hidden">
        <GearSix size={20} aria-hidden />
      </Link>
    </header>
  );
}

/** Detail pages (a passage, a deck, a student) get a back arrow to their list; section roots do not. */
function ActiveTopBar({ home, items, settingsHref }: Frame) {
  const pathname = usePathname();
  const deep = !items.some((i) => i.href === pathname) && pathname !== settingsHref;
  // A list that lives under a tab (Passages under Practice) goes back to that tab, not one level up the address.
  const owner = items.find((i) => i.also?.includes(pathname));
  return <TopBar home={home} settingsHref={settingsHref} deep={deep ? (owner?.href ?? parentOf(pathname, home)) : null} />;
}

/**
 * The signed-in frame, Warfront style: dark slate bars edged with a red rule around the paper page. On a laptop: a 220px sidebar (who you are, then the sections with their counts) beside the
 * open screen. On a phone or narrow tablet: the sections move to tabs along the bottom, within thumb reach, and a slim
 * bar on top carries the back arrow. Detail pages (a passage, a deck) keep their tab lit and get a back arrow.
 */
export function NavShell({
  home,
  items,
  badges,
  person,
  settingsHref,
  footer,
  banner,
  children,
}: Frame & {
  person: Promise<NavPerson>;
  footer?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const frame = { home, items, badges, settingsHref };
  return (
    <div className="flex h-dvh overflow-hidden bg-page">
      {/* sidebar, laptop and up */}
      <nav aria-label="Sections" className="band hidden w-[220px] shrink-0 flex-col gap-1 border-r-[3px] border-accent bg-bar px-3 py-5 md:flex">
        <Link href={home} className="mb-4 px-2.5 text-ink no-underline hover:no-underline">
          <Brand />
        </Link>
        <div className="flex min-h-12 flex-col gap-0.5 px-2.5 pb-3.5">
          <Suspense fallback={<span className="h-9" />}>
            <Person person={person} />
          </Suspense>
        </div>
        <Suspense fallback={<SideLinks items={items} current={null} badges={badges} />}>
          <ActiveSide {...frame} />
        </Suspense>
        <div className="mt-auto flex flex-col gap-2 pt-4">
          {footer && <div className="px-2.5">{footer}</div>}
          <Suspense fallback={<SettingsLink href={settingsHref} active={false} />}>
            <ActiveSettings {...frame} />
          </Suspense>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<TopBar home={home} settingsHref={settingsHref} deep={null} />}>
          <ActiveTopBar {...frame} />
        </Suspense>

        <main className="flex min-h-0 flex-1 flex-col">
          {banner}
          {/* A size container: a full-height screen (a passage with its questions) fills it with `pane-fill`. */}
          <div className="min-h-0 flex-1 overflow-y-auto [container-type:size]">
            <div className="pane-x pt-5 pb-12 md:pt-7">{children}</div>
          </div>
        </main>

        {/* bottom tabs, phone and narrow tablet */}
        <nav
          aria-label="Sections"
          className="flex shrink-0 justify-around border-t border-line bg-surface px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <Suspense fallback={<TabLinks items={items} current={null} badges={badges} />}>
            <ActiveTabs {...frame} />
          </Suspense>
        </nav>
      </div>
    </div>
  );
}
