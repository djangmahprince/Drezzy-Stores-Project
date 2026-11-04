"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { directoryAction, mergeCustomersAction, type DirRow } from "@/app/dashboard/customers/actions";
import { SavedViews, serverExport } from "@/components/dashboard/ListTools";

const blank = { q: "", region: "", tag: "", source: "", min_spend: "", last_after: "", last_before: "", with_balance: "", repeat: "", birthday_month: "", sort: "last_order" };

/**
 * The customer list (FR-DATA-001): search by name, phone or email; filter by region, tag, source, spend, last order and
 * birthday month; saved views as segments (FR-DATA-003); export; merge duplicates (FR-DATA-004). Phone numbers and emails
 * are masked for roles without export rights (FR-DATA-007).
 */
export function CustomerDirectory({ canExport, canMerge, regions }: { canExport: boolean; canMerge: boolean; regions: string[] }) {
  const [f, setF] = useState<Record<string, string>>(blank);
  const [data, setData] = useState<{ total: number; rows: DirRow[] } | null>(null);
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(0); };

  useEffect(() => {
    const p: Record<string, string | number | boolean> = { limit: 50, offset: page * 50 };
    for (const [k, v] of Object.entries(f)) if (v) p[k] = k === "with_balance" || k === "repeat" ? v === "1" : v;
    const t = window.setTimeout(() => void directoryAction(p).then((r) => r.ok ? setData(r.data!) : setMsg({ text: r.error, bad: true })), 250);
    return () => window.clearTimeout(t);
  }, [f, page]);

  const mask = (s: string | null) => (!s ? "" : canExport ? s : s.includes("@") ? s.replace(/^(.).*(@.*)$/, "$1•••$2") : s.replace(/^(\+\d{4}).*(\d{3})$/, "$1•••$2"));
  const sel = "min-h-9 rounded-[10px] border border-line bg-white px-2 text-sm";
  const ghs = (n: number | null) => (n === null ? "" : `GHS ${Number(n).toLocaleString("en-GH")}`);

  async function merge() {
    if (picked.length !== 2) return;
    const [keep, drop] = picked;
    const reason = window.prompt("Why are these the same person? (kept in the merge log)") ?? "";
    if (reason.trim().length < 3) return;
    start(async () => {
      const r = await mergeCustomersAction(keep, drop, reason);
      setMsg(r.ok ? { text: "Merged. The first one you ticked is kept; both people's orders now show on it." } : { text: r.error, bad: true });
      setPicked([]);
      setF((x) => ({ ...x }));
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="field !min-h-9 max-w-xs flex-1" value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Name, phone or email" aria-label="Search customers" />
        <select className={sel} value={f.region} onChange={(e) => set("region", e.target.value)} aria-label="Region"><option value="">All regions</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
        <input className={sel} value={f.tag} onChange={(e) => set("tag", e.target.value)} placeholder="Tag (VIP...)" aria-label="Tag" />
        <input className={sel} value={f.source} onChange={(e) => set("source", e.target.value)} placeholder="Source (Instagram...)" aria-label="Source" />
        <input className={`${sel} w-28`} type="number" value={f.min_spend} onChange={(e) => set("min_spend", e.target.value)} placeholder="Min spend" aria-label="Minimum spend" />
        <label className="flex items-center gap-1 text-sm">Last order from <input type="date" className={sel} value={f.last_after} onChange={(e) => set("last_after", e.target.value)} /></label>
        <label className="flex items-center gap-1 text-sm">to <input type="date" className={sel} value={f.last_before} onChange={(e) => set("last_before", e.target.value)} /></label>
        <select className={sel} value={f.birthday_month} onChange={(e) => set("birthday_month", e.target.value)} aria-label="Birthday month"><option value="">Any birthday</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(2000, i, 1).toLocaleDateString("en-GB", { month: "long" })}</option>)}</select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.with_balance === "1"} onChange={(e) => set("with_balance", e.target.checked ? "1" : "")} className="accent-[#00115b]" /> Owes a balance</label>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.repeat === "1"} onChange={(e) => set("repeat", e.target.checked ? "1" : "")} className="accent-[#00115b]" /> Repeat buyers</label>
        <select className={sel} value={f.sort} onChange={(e) => set("sort", e.target.value)} aria-label="Sort"><option value="last_order">Latest order</option><option value="spend">Spend</option><option value="orders">Orders</option><option value="name">Name</option></select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-text2">{data ? `${data.total} customers` : "Loading…"}</p>
          <SavedViews list="customers" current={f} onApply={(p) => { setF({ ...blank, ...p }); setPage(0); }} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canMerge && picked.length === 2 && <button type="button" disabled={pending} className="btn-primary !min-h-9 !px-3 text-sm" onClick={() => void merge()}>Merge the two ticked</button>}
          {canExport && (
            <select className={sel} value="" aria-label="Export these customers" onChange={async (e) => { const fmt = e.target.value; if (!fmt) return; setMsg({ text: "Preparing…" }); const err = await serverExport("customers", fmt, { q: f.q, region: f.region, tag: f.tag, source: f.source }); setMsg(err ? { text: err, bad: true } : { text: "Export ready. The link works for 24 hours." }); }}>
              <option value="">Export…</option><option value="csv">CSV</option><option value="xlsx">Excel</option><option value="pdf">PDF</option><option value="json">JSON</option>
            </select>
          )}
        </div>
      </div>
      {msg && <p role={msg.bad ? "alert" : "status"} className={`rounded-[12px] px-3 py-2 text-sm ${msg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-text2"><tr>{canMerge && <th className="w-10 px-3 py-3" />}<th className="px-4 py-3">Customer</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Region</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Orders</th><th className="px-4 py-3">Spend</th><th className="px-4 py-3">Last order</th><th className="px-4 py-3">Tags</th></tr></thead>
          <tbody>
            {(data?.rows ?? []).map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                {canMerge && <td className="px-3 py-3"><input type="checkbox" aria-label={`Pick ${c.name}`} className="accent-[#00115b]" checked={picked.includes(c.id)} onChange={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id].slice(-2)))} /></td>}
                <td className="px-4 py-3"><Link href={`/dashboard/customers/${c.id}`} className="font-semibold text-navy underline">{c.name}</Link>{c.has_account && <span className="chip ml-1 bg-card text-text2">Account</span>}<br /><span className="text-xs text-text2">{mask(c.email)}</span></td>
                <td className="px-4 py-3">{mask(c.phone)}</td>
                <td className="px-4 py-3">{c.region ?? ""}</td>
                <td className="px-4 py-3">{c.source ?? ""}</td>
                <td className="px-4 py-3">{c.orders}</td>
                <td className="px-4 py-3">{ghs(c.spend)}{c.balance > 0 && <span className="block text-xs text-warning">Owes {ghs(c.balance)}</span>}</td>
                <td className="px-4 py-3">{c.last_order ? new Date(c.last_order).toLocaleDateString("en-GB") : ""}</td>
                <td className="px-4 py-3">{c.tags.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.total > 50 && (
        <div className="flex items-center gap-2 text-sm">
          <button type="button" className="btn-outline !min-h-9" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page + 1} of {Math.ceil(data.total / 50)}</span>
          <button type="button" className="btn-outline !min-h-9" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
