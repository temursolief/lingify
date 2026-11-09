"use client";

import { useId, useRef, useState, type PointerEvent } from "react";

const W = 640;
const PAD = { top: 12, right: 12, bottom: 26, left: 40 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1);
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Round-number axis bounds and ticks that hug the data, so small changes stay visible. */
function niceScale(min: number, max: number) {
  const range = max - min || Math.max(1, Math.abs(max) * 0.1);
  const step = niceStep(range / 2);
  const lo = Math.max(0, Math.floor(min / step) * step);
  let hi = Math.ceil(max / step) * step;
  if (hi === lo) hi = lo + step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);
  return { lo, hi, ticks };
}

function shortDay(day: string) {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function TableView({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-muted hover:text-ink">Show as table</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full text-left tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-muted">
            <tr>{head.map((h) => <th key={h} className="py-1 pr-4 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="py-1 pr-4">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Tooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  const flip = x > 0.6;
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md"
      style={{ left: `${x * 100}%`, top: y, transform: flip ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
    >
      {children}
    </div>
  );
}

type Point = { day: string; value: number; title?: string };

/** Single-series line with a crosshair tooltip. One series, so the title names it and no legend is needed. */
export function LineChart({ data, height = 180, unit = "", label }: { data: Point[]; height?: number; unit?: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const gradient = useId();
  if (data.length < 2) return <p className="py-8 text-center text-sm text-muted">Not enough data yet. Keep going!</p>;

  const values = data.map((d) => d.value);
  const { lo, hi, ticks } = niceScale(Math.min(...values), Math.max(...values));
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (data.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH;
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join("");

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - PAD.left) / innerW) * (data.length - 1)))));
  };
  const h = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="relative">
        <svg ref={ref} viewBox={`0 0 ${W} ${height}`} className="w-full touch-none" role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--series-1)" stopOpacity="0.18" />
              <stop offset="1" stopColor="var(--series-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Math.round(t).toLocaleString()}</text>
            </g>
          ))}
          <path d={`${path}L${x(data.length - 1)},${PAD.top + innerH}L${x(0)},${PAD.top + innerH}Z`} fill={`url(#${gradient})`} />
          <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <text x={x(0)} y={height - 6} fontSize="11" fill="var(--muted)">{shortDay(data[0].day)}</text>
          <text x={x(data.length - 1)} y={height - 6} fontSize="11" fill="var(--muted)" textAnchor="end">{shortDay(data[data.length - 1].day)}</text>
          {hover !== null && h && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--muted)" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(h.value)} r="5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {h && hover !== null && (
          <Tooltip x={x(hover) / W} y={8}>
            <div className="text-muted">{shortDay(h.day)}</div>
            <div className="font-semibold tabular-nums">{h.value.toLocaleString()}{unit}</div>
            {h.title && <div className="max-w-48 truncate text-muted">{h.title}</div>}
          </Tooltip>
        )}
      </div>
      <TableView caption={label} head={["Date", label]} rows={data.map((d) => [shortDay(d.day), `${d.value.toLocaleString()}${unit}`, ...(d.title ? [d.title] : [])])} />
    </div>
  );
}

export type Series = { key: string; label: string; color: string };

/** Stacked daily bars (minutes per activity) with a legend and per-bar tooltip. */
export function StackedBars({ data, series, height = 200, label }: { data: { day: string; [k: string]: number | string }[]; series: Series[]; height?: number; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const rows = data;
  const totals = rows.map((r) => series.reduce((n, s) => n + (Number(r[s.key]) || 0), 0));
  const hi = niceMax(Math.max(...totals, 1));
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const slot = innerW / rows.length;
  const barW = Math.max(3, slot - 3);
  const y = (v: number) => PAD.top + innerH - (v / hi) * innerH;
  const ticks = [0, hi / 2, hi];
  const h = hover !== null ? rows[hover] : null;

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Math.round(t)}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            let acc = 0;
            const x0 = PAD.left + i * slot + (slot - barW) / 2;
            const segments = series.filter((s) => Number(r[s.key]) > 0);
            return (
              <g key={r.day} opacity={hover === null || hover === i ? 1 : 0.45}>
                {segments.map((s, j) => {
                  const v = Number(r[s.key]);
                  const top = y(acc + v);
                  const bottom = y(acc);
                  acc += v;
                  const isTop = j === segments.length - 1;
                  // 2px surface gap between stacked segments
                  const hgt = Math.max(0, bottom - top - (j > 0 ? 2 : 0));
                  return (
                    <rect key={s.key} x={x0} y={top} width={barW} height={hgt} fill={s.color} rx={isTop ? Math.min(3, barW / 2) : 0} />
                  );
                })}
                <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
              </g>
            );
          })}
          <text x={PAD.left} y={height - 6} fontSize="11" fill="var(--muted)">{shortDay(rows[0].day)}</text>
          <text x={W - PAD.right} y={height - 6} fontSize="11" fill="var(--muted)" textAnchor="end">{shortDay(rows[rows.length - 1].day)}</text>
        </svg>
        {h && hover !== null && (
          <Tooltip x={(PAD.left + (hover + 0.5) * slot) / W} y={8}>
            <div className="mb-1 text-muted">{shortDay(h.day)} · {totals[hover]} min</div>
            {series.filter((s) => Number(h[s.key]) > 0).map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span>{s.label}</span>
                <span className="ml-auto pl-3 font-medium tabular-nums">{Number(h[s.key])} min</span>
              </div>
            ))}
            {totals[hover] === 0 && <div>No activity</div>}
          </Tooltip>
        )}
      </div>
      <TableView
        caption={label}
        head={["Date", ...series.map((s) => s.label), "Total"]}
        rows={rows.map((r, i) => [shortDay(r.day), ...series.map((s) => Number(r[s.key]) || 0), totals[i]])}
      />
    </div>
  );
}

/** Horizontal bars for a small set of totals; labels and values are text, the bar only shows proportion. */
export function BarList({ items, unit = "" }: { items: { label: string; value: number; color?: string }[]; unit?: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex justify-between text-sm">
            <span>{item.label}</span>
            <span className="font-medium tabular-nums">{item.value.toLocaleString()}{unit}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-line">
            <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: item.color ?? "var(--series-1)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
