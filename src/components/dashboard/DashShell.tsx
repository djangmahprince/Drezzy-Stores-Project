import Link from "next/link";
import { Sparkline } from "@/components/dashboard/Charts";

export { DashSidebar, DashTopbar } from "@/components/dashboard/DashNav";

export function PageHead({ title, sub, actions, real }: { title: string; sub?: string; actions?: React.ReactNode; real?: boolean }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-3 text-[28px] font-bold leading-tight text-navy">{title} {!real && <span className="chip bg-[#fbeedb] text-warning">Sample data</span>}</h1>
        {sub && <p className="mt-1 text-sm text-text2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export type Trend = { x: string; y: number }[];

/** A KPI card (FR-DB-004): the number, its change against the last period, and a small trend line. Opens the detail when linked. */
export function Kpi({ label, value, note, noteTone, valueTone, trend, href, children }: {
  label: string; value: string; note?: string; noteTone?: "ok" | "bad" | "warn"; valueTone?: "ok" | "bad"; trend?: Trend; href?: string; children?: React.ReactNode;
}) {
  const noteCls = noteTone === "ok" ? "text-success" : noteTone === "bad" ? "text-error" : noteTone === "warn" ? "text-warning" : "text-text2";
  const body = (
    <>
      <p className="text-sm text-text2">{label}</p>
      <p className={`mt-1 text-[26px] font-bold leading-tight ${valueTone === "ok" ? "text-success" : valueTone === "bad" ? "text-error" : "text-navy"}`}>{value}</p>
      {children}
      {note && <p className={`mt-1 text-xs font-medium ${noteCls}`}>{note}</p>}
      {trend && <Sparkline points={trend} label={label} />}
    </>
  );
  return href ? <Link href={href} className="card block p-4 transition-shadow hover:shadow-md">{body}</Link> : <div className="card p-4">{body}</div>;
}

/** Today, this week, this month: a segmented control, as links or as buttons. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-[12px] border border-line bg-white p-1 text-sm" role="group" aria-label={label}>
      {options.map(([k, l]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)} className={`min-h-9 rounded-[9px] px-3 font-medium transition-colors ${value === k ? "bg-navy text-white" : "text-text2 hover:text-navy"}`}>{l}</button>)}
    </div>
  );
}

/** Round initials, as in the team lists and the sidebar. */
export function Avatar({ name, tone = "navy" }: { name: string; tone?: "navy" | "lime" | "grey" }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const cls = tone === "lime" ? "bg-lime text-navy" : tone === "grey" ? "bg-card text-navy" : "bg-navy text-lime";
  return <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${cls}`} aria-hidden="true">{letters}</span>;
}

const tones = {
  ok: "bg-[#e3f5ee] text-success",
  warn: "bg-[#fbeedb] text-warning",
  bad: "bg-[#fbe4e4] text-error",
  info: "bg-[#e6eaf8] text-navy",
} as const;

export function Pill({ tone = "info", children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`chip ${tones[tone]}`}>{children}</span>;
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-text2">
          <tr>{head.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {r.map((c, j) => <td key={j} className="px-4 py-3">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Progress({ pct, tone = "info" }: { pct: number; tone?: "ok" | "warn" | "bad" | "info" }) {
  const bar = { ok: "bg-success", warn: "bg-warning", bad: "bg-error", info: "bg-navy" }[tone];
  return (
    <div className="h-2 w-full rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-2 rounded-full ${bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}
