"use client";

import { useId } from "react";

type Point = { ts: number; yesCents: number };

/** Dependency-free SVG price-history chart with a Y axis (YES price in cents = implied %).
 * Trend-colored: green if up over the window, red if down. */
export function Sparkline({ points, height = 140 }: { points: Point[]; height?: number }) {
  const gradId = useId();
  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-xs text-neutral-500"
        style={{ height }}
      >
        Not enough price history yet.
      </div>
    );
  }

  const W = 600;
  const H = height;
  const padY = 10;
  const ys = points.map((p) => p.yesCents);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = Math.max(1, max - min);
  const mid = Math.round((min + max) / 2);
  const n = points.length;

  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - 2 * padY);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.yesCents).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${x(n - 1).toFixed(1)} ${H - padY} L ${x(0).toFixed(1)} ${H - padY} Z`;

  const up = points[n - 1].yesCents >= points[0].yesCents;
  const stroke = up ? "#10b981" : "#f43f5e";
  const ticks = max === min ? [max] : [max, mid, min];

  return (
    <div className="relative flex" style={{ height: H }}>
      {/* Y axis labels (¢ = implied %) */}
      <div className="relative w-9 shrink-0 font-mono text-[10px] text-neutral-500">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-2 -translate-y-1/2 tabular-nums"
            style={{ top: y(t) }}
          >
            {t}¢
          </span>
        ))}
      </div>
      <div className="flex-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: H }}
          role="img"
          aria-label="Price history"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* gridlines */}
          {ticks.map((t) => (
            <line
              key={t}
              x1={0}
              x2={W}
              y1={y(t)}
              y2={y(t)}
              stroke="#ffffff"
              strokeOpacity={0.06}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill={`url(#${gradId})`} />
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={x(n - 1)}
            cy={y(points[n - 1].yesCents)}
            r={3}
            fill={stroke}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  );
}
