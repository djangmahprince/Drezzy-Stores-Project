"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pill, Table } from "@/components/dashboard/DashShell";

import { kindLabels, type ExportKind } from "@/lib/export/kinds";

export type ExportJob = { id: string; kind: string; format: string; status: string; row_count: number | null; created_at: string; expires_at: string | null; error: string | null };

const dated = new Set(["orders", "money", "expenses", "analytics"]);
const stamp = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" }).format(new Date(iso));

/** The export screen (FR-DATA-005 to 007): choose the data, the format and the filters, then download through a 24-hour link. */
export function ExportCenter({ kinds, canJson, jobs }: { kinds: string[]; canJson: boolean; jobs: ExportJob[] }) {
  const router = useRouter();
  const [kind, setKind] = useState(kinds[0]);
  const [format, setFormat] = useState("xlsx");
  const [f, setF] = useState({ from: "", to: "", status: "", region: "", channel: "" });
  const [result, setResult] = useState<{ url?: string; rows?: number; error?: string } | null>(null);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const filters = Object.fromEntries(Object.entries(f).filter(([k, v]) => v && (dated.has(kind) || !["from", "to"].includes(k)) && (kind === "orders" || !["status", "channel"].includes(k))));
      const res = await fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, format, filters }) });
      const body = (await res.json().catch(() => ({}))) as { url?: string; rows?: number; error?: string };
      setResult(res.ok ? body : { error: body.error ?? "That export did not work." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm"><span className="mb-1 block font-medium">What</span><select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k} value={k}>{k === "catalogue" ? "Catalogue (no supplier costs)" : kindLabels[k as ExportKind]}</option>)}</select></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Format</span>
          <select className="field" value={format} onChange={(e) => setFormat(e.target.value)}><option value="xlsx">Excel</option><option value="csv">CSV</option><option value="pdf">PDF</option>{canJson && <option value="json">JSON</option>}</select>
        </label>
        {dated.has(kind) && (
          <>
            <label className="text-sm"><span className="mb-1 block font-medium">From</span><input type="date" className="field" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
            <label className="text-sm"><span className="mb-1 block font-medium">To</span><input type="date" className="field" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          </>
        )}
        {(kind === "orders" || kind === "customers") && <label className="text-sm"><span className="mb-1 block font-medium">Region</span><input className="field" placeholder="All regions" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} /></label>}
        {kind === "orders" && (
          <>
            <label className="text-sm"><span className="mb-1 block font-medium">Status</span>
              <select className="field" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All</option>{["awaiting_payment", "to_confirm", "to_source", "ready_to_pack", "packed", "dispatched", "out_for_delivery", "delivered", "failed_delivery", "cancelled"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
            </label>
            <label className="text-sm"><span className="mb-1 block font-medium">Channel</span>
              <select className="field" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}><option value="">All</option>{["web", "whatsapp", "instagram_dm", "phone", "walk_in"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
            </label>
          </>
        )}
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
          <button type="button" disabled={pending} className="btn-primary !min-h-10" onClick={run}>{pending ? "Preparing…" : "Create export"}</button>
          {result?.url && <a href={result.url} className="btn-outline !min-h-10">Download ({result.rows} rows)</a>}
          {result?.error && <p role="alert" className="text-sm text-error">{result.error}</p>}
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Your recent exports</h2>
        {jobs.length === 0 ? <p className="card p-6 text-center text-sm text-text2">Nothing exported yet.</p> : (
          <Table head={["When", "What", "Format", "Rows", "Status"]} rows={jobs.map((j) => [
            stamp(j.created_at), kindLabels[j.kind as ExportKind] ?? j.kind, j.format.toUpperCase(), j.row_count ?? "-",
            <Pill key={j.id} tone={j.status === "done" ? "ok" : j.status === "failed" ? "bad" : "info"}>{j.status === "done" ? "Ready" : j.status === "failed" ? "Failed" : "Running"}</Pill>,
          ])} />
        )}
      </section>
    </div>
  );
}
