"use client";

import { useEffect, useState } from "react";

/** A live countdown to a drop (FR-SF-010). Before hydration it shows the date, so the server and browser agree. */
export function Countdown({ to, onDone }: { to: string; onDone?: () => void }) {
  const target = Date.parse(to);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (now !== null && now >= target) onDone?.();
  }, [now, target, onDone]);
  if (now === null) {
    return <time dateTime={to}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(target)}</time>;
  }
  const left = Math.max(0, target - now);
  if (left === 0) return <span>Live now</span>;
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return <span aria-live="off" className="tabular-nums">Drops in {d > 0 ? `${d}d ` : ""}{String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}</span>;
}
