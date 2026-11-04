// The Owner and Admin dashboard, shaped once so the live data and the design preview draw the same screen.
export type HomeKpi = { label: string; value: string; note?: string; noteTone?: "ok" | "bad" | "warn"; trend?: { x: string; y: number }[]; href?: string };
export type Period = "today" | "week" | "month";
export type OwnerView = {
  greeting: string;
  periods: Record<Period, HomeKpi[]>;
  week: { goal: number | null; paid: number; daysLeft: number; paceNeeded: number | null; days: { label: string; amount: number; today: boolean; future: boolean }[] };
  stages: { label: string; count: number; note?: string; tone?: "warn" | "bad" }[];
  sources: { source: string; count: number }[];
  team: { name: string; role: string; text: string; pct: number; pace: string; tone: "ok" | "warn" | "bad" }[];
  attention: { tag: string; text: string; href: string; tone: "bad" | "warn" | "info" }[];
};
