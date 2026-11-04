// Is a target on pace? Pure, so the dashboard and the tests agree.

export type Pace = { pct: number; tone: "ok" | "warn" | "bad"; label: string };

/** `elapsed` is how much of the period has passed (0 to 1). */
export function paceOf(actual: number, goal: number, elapsed: number): Pace {
  const pct = goal > 0 ? Math.round((actual / goal) * 100) : 0;
  if (actual >= goal) return { pct, tone: "ok", label: "Hit" };
  // someone who has done 80% of what is expected by now is on pace; under half of it is behind
  const expected = goal * Math.min(1, Math.max(0, elapsed));
  if (elapsed <= 0 || actual >= expected * 0.8) return { pct, tone: "ok", label: "On pace" };
  if (actual >= expected * 0.5) return { pct, tone: "warn", label: "Close" };
  return { pct, tone: "bad", label: "Behind" };
}

export const metricLabels: Record<string, { name: string; unit: "GHS" | "count" | "percent" }> = {
  paid_sales: { name: "Paid sales", unit: "GHS" },
  orders: { name: "Paid orders", unit: "count" },
  deliveries: { name: "Deliveries made", unit: "count" },
  supplier_orders: { name: "Supplier orders placed", unit: "count" },
  reports: { name: "Daily reports filed", unit: "count" },
  on_time_deliveries: { name: "On-time delivery rate", unit: "percent" },
  balances_collected: { name: "Balances collected", unit: "GHS" },
  articles_published: { name: "Drip School posts published", unit: "count" },
  check_in: { name: "Check-in number (from daily reports)", unit: "count" },
};

export const formatMetric = (metric: string, n: number) => {
  const u = metricLabels[metric]?.unit;
  return u === "GHS" ? `GHS ${n.toLocaleString("en-GH")}` : u === "percent" ? `${n}%` : n.toLocaleString("en-GH");
};
