export { DashSidebar, DashTopbar } from "@/components/dashboard/DashNav";

export function PageHead({ title, sub, actions, real }: { title: string; sub?: string; actions?: React.ReactNode; real?: boolean }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold leading-tight">{title}</h1>
        {sub && <p className="text-sm text-text2">{sub} {!real && <span className="chip ml-1 bg-card text-text2">Sample data</span>}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-text2">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {note && <p className="text-xs text-text2">{note}</p>}
    </div>
  );
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
