"use client";

import { useId } from "react";

type Point = { ts: number; yesCents: number };

/** Dependency-free SVG price-history chart. Trend-colored (green if up over the window). */
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
  const pad = 8;
  const ys = points.map((p) => p.yesCents);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = Math.max(1, max - min);
  const n = points.length;

  const x = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - 2 * pad);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.yesCents).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(n - 1).toFixed(1)} ${H - pad} L ${x(0).toFixed(1)} ${H - pad} Z`;

  const up = points[n - 1].yesCents >= points[0].yesCents;
  const stroke = up ? "#10b981" : "#f43f5e";
  const lastY = y(points[n - 1].yesCents);

  return (
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
      <circle cx={x(n - 1)} cy={lastY} r={3} fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
