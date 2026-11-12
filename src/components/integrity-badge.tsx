import type { ReviewHealth } from "@/lib/insights";
import type { Badge as IntegrityBadgeData } from "@/lib/telemetry";
import { REASON_LABEL } from "@/lib/telemetry";
import { Badge } from "./ui";

const TONE = { clean: "good", warn: "warn", flagged: "bad", none: "neutral" } as const;

/** Green / amber / red for one attempt, with the reasons as a tooltip (and in full when `detailed`). */
export function IntegrityBadge({ badge, detailed = false }: { badge: IntegrityBadgeData | null; detailed?: boolean }) {
  if (!badge || badge.tone === "none") return <span className="text-muted">–</span>;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span title={badge.details.join(" · ")}>
        <Badge tone={TONE[badge.tone]}>{badge.label}</Badge>
      </span>
      {detailed && badge.details.length > 0 && <span className="text-xs text-muted">{badge.details.join(" · ")}</span>}
    </span>
  );
}

/** Flashcard study speed: red when it looks clicked through, else the median time per card. */
export function ReviewSpeed({ review }: { review: ReviewHealth | null }) {
  if (!review || !review.timed) return <span className="text-muted">–</span>;
  const median = review.medianMs !== null ? `${(review.medianMs / 1000).toFixed(1)} s/card` : "";
  return review.spammed ? (
    <span title={`${review.suspicious} of ${review.timed} reviews under 1.2 s in 7 days`}>
      <Badge tone="bad">{REASON_LABEL.VOCAB_SPAMMED}</Badge> <span className="text-xs text-muted">{median}</span>
    </span>
  ) : (
    <span className="text-sm text-muted tabular-nums" title={`${review.timed} timed reviews in 7 days`}>{median}</span>
  );
}
