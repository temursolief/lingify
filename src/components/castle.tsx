import type { ReactNode } from "react";

/**
 * A student's fortress, drawn in the Warfront palette as one small inline SVG (no images to download). Each stage
 * adds to the one before: tent, fence, wooden tower, stone tower, walls and gate, keep, side towers, double walls,
 * golden roofs. The streak lights the beacon on top, shields hang by the gate, crowns float above.
 * `ghost` draws a locked stage as a pale outline.
 */
export function Castle({
  stage,
  streak = 0,
  shields = 0,
  crowns = 0,
  ghost = false,
  className,
  title,
}: {
  stage: number;
  streak?: number;
  shields?: number;
  crowns?: number;
  ghost?: boolean;
  className?: string;
  title?: string;
}) {
  const c = ghost ? GHOST : COLORS;
  const roof = stage >= 8 ? c.gold : c.roof;
  const parts: ReactNode[] = [];
  let beacon = { x: 120, y: 100 };

  const tent = (x: number, s = 1) => (
    <g key={`tent${x}`}>
      <path d={`M${x - 22 * s} 130 L${x} ${130 - 34 * s} L${x + 22 * s} 130 Z`} fill={c.cloth} stroke={c.ink} strokeWidth={2} strokeLinejoin="round" />
      <path d={`M${x} ${130 - 34 * s} L${x - 6 * s} 130 L${x + 6 * s} 130 Z`} fill={c.dark} />
    </g>
  );
  const fence = (x1: number, x2: number) => {
    const stakes = [];
    for (let x = x1; x <= x2; x += 9) stakes.push(<path key={x} d={`M${x - 3.5} 130 V112 L${x} 106 L${x + 3.5} 112 V130 Z`} fill={c.wood} stroke={c.ink} strokeWidth={1.5} strokeLinejoin="round" />);
    return (
      <g key={`fence${x1}`}>
        <rect x={x1} y={117} width={x2 - x1} height={4} fill={c.woodDark} />
        {stakes}
      </g>
    );
  };
  const woodTower = (x: number, top: number) => (
    <g key={`wt${x}`}>
      <path d={`M${x - 14} 130 L${x - 10} ${top + 14} M${x + 14} 130 L${x + 10} ${top + 14} M${x - 12} 120 L${x + 12} ${top + 30} M${x + 12} 120 L${x - 12} ${top + 30}`} stroke={c.woodDark} strokeWidth={3} />
      <rect x={x - 16} y={top} width={32} height={16} fill={c.wood} stroke={c.ink} strokeWidth={2} />
      <path d={`M${x - 19} ${top} L${x} ${top - 16} L${x + 19} ${top} Z`} fill={roof} stroke={c.ink} strokeWidth={2} strokeLinejoin="round" />
    </g>
  );
  /** A stone tower: crenellated top, or a cone roof. */
  const tower = (x: number, top: number, w: number, cone: boolean, key: string) => (
    <g key={key}>
      <rect x={x - w / 2} y={top} width={w} height={130 - top} fill={c.stone} stroke={c.ink} strokeWidth={2} />
      <rect x={x + w / 2 - w * 0.28} y={top} width={w * 0.28} height={130 - top} fill={c.stoneShade} />
      <rect x={x - w / 2} y={top} width={w} height={130 - top} fill="none" stroke={c.ink} strokeWidth={2} />
      <path d={`M${x - 3} ${top + 16} v-4 a3 3 0 0 1 6 0 v4 Z`} fill={c.dark} />
      {cone ? (
        <path d={`M${x - w / 2 - 4} ${top} L${x} ${top - w * 0.95} L${x + w / 2 + 4} ${top} Z`} fill={roof} stroke={c.ink} strokeWidth={2} strokeLinejoin="round" />
      ) : (
        crenels(x - w / 2, x + w / 2, top, `${key}c`)
      )}
    </g>
  );
  function crenels(x1: number, x2: number, top: number, key: string) {
    const n = Math.max(2, Math.round((x2 - x1) / 9));
    const step = (x2 - x1) / n;
    return (
      <g key={key}>
        {Array.from({ length: n }, (_, i) =>
          i % 2 === 0 ? <rect key={i} x={x1 + i * step} y={top - 6} width={step} height={6} fill={c.stone} stroke={c.ink} strokeWidth={2} /> : null,
        )}
      </g>
    );
  }
  const wall = (x1: number, x2: number, top: number) => (
    <g key={`wall${x1}`}>
      <rect x={x1} y={top} width={x2 - x1} height={130 - top} fill={c.stone} stroke={c.ink} strokeWidth={2} />
      <path d={`M${x1} ${top + 12} H${x2} M${x1} ${top + 24} H${x2}`} stroke={c.stoneShade} strokeWidth={1.5} />
      {crenels(x1, x2, top, `wc${x1}`)}
    </g>
  );
  const gate = (x: number, w: number) => (
    <g key="gate">
      <path d={`M${x - w / 2} 130 V${130 - w * 0.75} a${w / 2} ${w / 2} 0 0 1 ${w} 0 V130 Z`} fill={c.dark} stroke={c.ink} strokeWidth={2} />
      <path d={`M${x - w / 4} 130 V${118 - w * 0.6} M${x} 130 V${112 - w * 0.6} M${x + w / 4} 130 V${118 - w * 0.6} M${x - w / 2} ${126 - w * 0.3} H${x + w / 2}`} stroke={c.ink} strokeWidth={1.2} opacity={0.8} />
    </g>
  );
  const flag = (x: number, y: number, key: string, big = false) => (
    <g key={key}>
      <path d={`M${x} ${y} V${y - (big ? 26 : 16)}`} stroke={c.ink} strokeWidth={1.8} />
      <path d={big ? `M${x} ${y - 26} h20 l-5 6 l5 6 h-20 Z` : `M${x} ${y - 16} l12 4 l-12 4 Z`} fill={big ? c.roof : c.gold} stroke={c.ink} strokeWidth={1.2} strokeLinejoin="round" />
    </g>
  );

  switch (Math.max(0, Math.min(8, stage))) {
    case 0:
      parts.push(tent(110));
      beacon = { x: 150, y: 128 };
      break;
    case 1:
      parts.push(tent(120), fence(66, 176));
      beacon = { x: 176, y: 104 };
      break;
    case 2:
      parts.push(tent(92, 0.8), woodTower(148, 74), fence(54, 190));
      beacon = { x: 148, y: 56 };
      break;
    case 3:
      parts.push(tower(120, 56, 30, true, "t"), fence(48, 192), flag(120, 28, "f"));
      beacon = { x: 98, y: 104 };
      break;
    case 4:
      parts.push(tower(120, 48, 30, true, "t"), wall(62, 178, 96), gate(120, 22));
      beacon = { x: 120, y: 20 };
      break;
    case 5:
      parts.push(tower(120, 52, 56, false, "k"), wall(48, 192, 98), gate(120, 24), flag(132, 46, "f"));
      beacon = { x: 108, y: 44 };
      break;
    case 6:
      parts.push(tower(120, 48, 56, false, "k"), wall(48, 192, 98), tower(48, 76, 26, true, "l"), tower(192, 76, 26, true, "r"), gate(120, 24), flag(132, 42, "f"));
      beacon = { x: 108, y: 40 };
      break;
    default:
      parts.push(
        tower(120, 34, 52, false, "k"),
        tower(86, 52, 22, true, "il"),
        tower(154, 52, 22, true, "ir"),
        wall(30, 210, 92),
        tower(30, 70, 26, true, "l"),
        tower(210, 70, 26, true, "r"),
        gate(120, 26),
        flag(30, 45, "fl"),
        flag(210, 45, "fr"),
        flag(132, 28, "f", stage >= 8),
      );
      beacon = { x: 108, y: 26 };
  }

  const lit = streak > 0;
  return (
    <svg viewBox="0 0 240 160" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {!ghost && <ellipse cx={120} cy={150} rx={128} ry={28} fill={c.hillShade} />}
      <ellipse cx={120} cy={146} rx={122} ry={24} fill={c.hill} stroke={ghost ? c.ink : "none"} strokeWidth={ghost ? 1.5 : 0} strokeDasharray={ghost ? "4 4" : undefined} />
      {parts}
      {!ghost && (
        <g>
          {/* beacon: lit while the streak lives */}
          <path d={`M${beacon.x - 6} ${beacon.y} h12 l-3 6 h-6 Z`} fill={c.dark} stroke={c.ink} strokeWidth={1.5} strokeLinejoin="round" />
          {lit && (
            <g className="motion-safe:animate-[flicker_1.6s_ease-in-out_infinite]" style={{ transformOrigin: `${beacon.x}px ${beacon.y}px` }}>
              <path d={`M${beacon.x} ${beacon.y - 16 - Math.min(8, streak / 3)} C${beacon.x + 9} ${beacon.y - 8} ${beacon.x + 6} ${beacon.y} ${beacon.x} ${beacon.y} C${beacon.x - 6} ${beacon.y} ${beacon.x - 9} ${beacon.y - 8} ${beacon.x} ${beacon.y - 16 - Math.min(8, streak / 3)} Z`} fill="#e07a5f" />
              <path d={`M${beacon.x} ${beacon.y - 9} C${beacon.x + 4} ${beacon.y - 5} ${beacon.x + 3} ${beacon.y} ${beacon.x} ${beacon.y} C${beacon.x - 3} ${beacon.y} ${beacon.x - 4} ${beacon.y - 5} ${beacon.x} ${beacon.y - 9} Z`} fill="#d9a441" />
            </g>
          )}
          {/* shields by the gate */}
          {Array.from({ length: Math.min(2, shields) }, (_, i) => (
            <path
              key={i}
              d={`M${22 + i * 18} 112 h14 v7 c0 6 -4 9 -7 11 c-3 -2 -7 -5 -7 -11 Z`}
              fill={c.olive}
              stroke={c.ink}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}
          {/* crowns: weeks won */}
          {crowns > 0 && (
            <g>
              <path d="M196 22 l5 -10 l6 7 l6 -9 l6 9 l6 -7 l5 10 v6 h-34 Z" fill={c.gold} stroke={c.ink} strokeWidth={1.8} strokeLinejoin="round" />
              {crowns > 1 && (
                <text x={213} y={42} textAnchor="middle" fontSize={13} fontWeight={700} fill={c.ink} fontFamily="var(--font-display)">
                  ×{crowns}
                </text>
              )}
            </g>
          )}
        </g>
      )}
    </svg>
  );
}

const COLORS = {
  ink: "#1f2a2e",
  dark: "#3a4648",
  stone: "#e4dcc8",
  stoneShade: "#c9bfa6",
  wood: "#c28a52",
  woodDark: "#8c5a30",
  cloth: "#efe3c8",
  roof: "#c2402a",
  gold: "#d9a441",
  olive: "#5e7a3a",
  hill: "#b3bc8c",
  hillShade: "#9aa577",
};

const GHOST = {
  ink: "#b9ae92",
  dark: "#e4dcc8",
  stone: "#f1ebdd",
  stoneShade: "#e4dcc8",
  wood: "#f1ebdd",
  woodDark: "#d9cfb8",
  cloth: "#f1ebdd",
  roof: "#e4dcc8",
  gold: "#e4dcc8",
  olive: "#e4dcc8",
  hill: "#efe9db",
  hillShade: "#efe9db",
};
