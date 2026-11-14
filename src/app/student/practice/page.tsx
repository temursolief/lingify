import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenText, Headphones, LockKey, type Icon } from "@/components/icons";
import { Badge, PageHeader, PageSkeleton } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { skillBands } from "@/lib/skills";
import { studentHomework } from "@/lib/today";

export const metadata: Metadata = { title: "Practice" };

function SkillCard({ href, icon: I, name, band, desc, open, done }: { href: string; icon: Icon; name: string; band: number | null; desc: string; open: number; done: number }) {
  return (
    <Link href={href} className="flex flex-col gap-2.5 rounded-xl bg-surface p-[18px] text-ink no-underline hover:shadow-[0_0_0_1px_var(--color-accent-700)] hover:no-underline">
      <div className="flex items-center gap-2.5">
        <I size={24} className="text-[var(--color-accent-400)]" aria-hidden />
        <span className="text-[17px] font-medium">{name}</span>
        <span className="ml-auto text-[13px] text-soft tabular-nums">{band !== null ? band.toFixed(1) : "–"}</span>
      </div>
      <span className="text-[13px] text-soft">{desc}</span>
      <div className="mt-auto flex flex-wrap gap-1.5">
        <Badge tone={open ? "accent" : "neutral"}>{open ? `${open} assigned` : "Nothing assigned"}</Badge>
        <Badge>{done} done</Badge>
      </div>
    </Link>
  );
}

async function PracticeContent() {
  const user = await requireStudent();
  const [homework, bands] = await Promise.all([studentHomework(user.id), skillBands(user.id)]);
  const count = (kind: "reading" | "listening", done: boolean) => homework.filter((h) => h.kind === kind && (h.state === "done") === done).length;
  return (
    <>
      <PageHeader kicker="Practice" title="Reading and listening, the IELTS way" />
      <div className="flex flex-col gap-5">
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
          <SkillCard
            href="/student/passages"
            icon={BookOpenText}
            name="Reading"
            band={bands.reading.band}
            desc="IELTS Academic passages. First try in exam mode, then fix your answers with proof from the text."
            open={count("reading", false)}
            done={count("reading", true)}
          />
          <SkillCard
            href="/student/listening"
            icon={Headphones}
            name="Listening"
            band={bands.listening.band}
            desc="Short video lessons. Key words first, then IELTS Listening questions."
            open={count("listening", false)}
            done={count("listening", true)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-section p-5">
          <LockKey size={32} className="text-[var(--color-accent-200)]" aria-hidden />
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
            <span className="text-lg font-medium">Every first try is exam mode</span>
            <span className="text-[13px] text-[var(--color-accent-200)]">
              Timed, full screen, one band score. Corrections open afterwards: the right answer is never shown, so you find it in the text yourself. +3 XP for every answer you get right at the first try; leaving the test costs XP.
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PracticeContent />
    </Suspense>
  );
}
