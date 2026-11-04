"use client";

import { useState } from "react";

/** A trend line for a KPI card: one series, 2px line, hover shows the day and value. */
export function Sparkline({ points, label }: { points: { x: string; y: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const w = 160, h = 36, max = Math.max(1, ...points.map((p) => p.y));
  const px = (i: number) => (i / (points.length - 1)) * (w - 4) + 2;
  const py = (y: number) => h - 3 - (y / max) * (h - 6);
  const d = points.map((p, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(p.y).toFixed(1)}`).join(" ");
  const cur = hover === null ? null : points[hover];
  return (
    <div className="relative mt-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" role="img" aria-label={`${label}: trend over ${points.length} days`} preserveAspectRatio="none"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))); }} onMouseLeave={() => setHover(null)}>
        <path d={d} fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={px(hover)} x2={px(hover)} y1="0" y2={h} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {cur && <p className="absolute -top-5 right-0 rounded bg-ink px-1.5 py-0.5 text-[11px] text-white">{cur.x.slice(5)} · {cur.y.toLocaleString("en-GH")}</p>}
    </div>
  );
}

/** Daily bars with a per-bar tooltip, on a thin baseline. */
export function DayBars({ points, label }: { points: { x: string; y: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.y));
  return (
    <div className="relative">
      {hover !== null && <p className="absolute right-0 top-0 rounded bg-ink px-2 py-0.5 text-xs text-white">{points[hover].x} · {points[hover].y.toLocaleString("en-GH")}</p>}
      <div className="flex h-36 items-end gap-[2px] border-b border-line" role="img" aria-label={label}>
        {points.map((p, i) => (
          <div key={p.x} className="flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className={`w-full max-w-6 rounded-t-[4px] ${hover === i ? "bg-navy-2" : "bg-navy"}`} style={{ height: `${Math.max(p.y ? 3 : 0, (p.y / max) * 100)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
