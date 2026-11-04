"use client";

import { useEffect, useState } from "react";
import { deleteViewAction, saveViewAction, savedViewsAction, type SavedView } from "@/app/dashboard/actions";

/**
 * Saved views for a list (FR-DB-002): name the current filters and come back to them. Stored per person in the database,
 * so they follow the staff member to any device.
 */
export function SavedViews({ list, current, onApply }: { list: string; current: Record<string, string>; onApply: (p: Record<string, string>) => void }) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const load = () => savedViewsAction(list).then(setViews).catch(() => {});
  useEffect(() => void load(), [list]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {views.length > 0 && (
        <select className="min-h-9 rounded-[10px] border border-line bg-white px-2" aria-label="Saved views" value="" onChange={(e) => { const v = views.find((x) => x.id === e.target.value); if (v) onApply(v.params); }}>
          <option value="">Saved views…</option>{views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      )}
      {naming ? (
        <form className="flex gap-1" onSubmit={async (e) => { e.preventDefault(); const r = await saveViewAction(list, name, current); if (r.ok) { setNaming(false); setName(""); void load(); } }}>
          <input autoFocus className="min-h-9 rounded-[10px] border border-line px-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="View name" aria-label="View name" />
          <button className="btn-primary !min-h-9 !px-3 text-sm">Save</button>
          <button type="button" className="text-text2 underline" onClick={() => setNaming(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="text-navy underline" onClick={() => setNaming(true)}>Save this view</button>
      )}
      {views.length > 0 && !naming && (
        <details className="relative">
          <summary className="cursor-pointer text-text2 underline">Manage</summary>
          <ul className="absolute z-20 mt-1 w-56 rounded-[12px] border border-line bg-white p-2 shadow-lg">
            {views.map((v) => <li key={v.id} className="flex items-center justify-between gap-2 py-1"><span className="truncate">{v.name}</span><button type="button" className="text-error underline" onClick={async () => { await deleteViewAction(v.id); void load(); }}>Delete</button></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Which columns a list shows (FR-DB-002). Remembered on this device. */
export function useColumns(list: string, all: string[], defaults: string[]) {
  const key = `drezzy.cols.${list}`;
  const [cols, setCols] = useState<string[]>(defaults);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (Array.isArray(saved)) void Promise.resolve().then(() => setCols(saved.filter((c: string) => all.includes(c))));
    } catch { /* ignore */ }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (c: string) => setCols((cur) => {
    const next = cur.includes(c) ? cur.filter((x) => x !== c) : all.filter((x) => x === c || cur.includes(x));
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  return { cols, toggle };
}

export function ColumnChooser({ all, cols, toggle }: { all: string[]; cols: string[]; toggle: (c: string) => void }) {
  return (
    <details className="relative text-sm">
      <summary className="cursor-pointer rounded-[10px] border border-line bg-white px-3 py-1.5">Columns</summary>
      <div className="absolute right-0 z-20 mt-1 w-52 rounded-[12px] border border-line bg-white p-2 shadow-lg">
        {all.map((c) => <label key={c} className="flex items-center gap-2 py-1"><input type="checkbox" checked={cols.includes(c)} onChange={() => toggle(c)} className="accent-[#00115b]" /> {c}</label>)}
      </div>
    </details>
  );
}

/** Turns rows into a CSV download in the browser (for "export selected"). Text that looks like a formula is neutralised. */
export function downloadCsv(name: string, head: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Starts a server export with the given filters and opens the 24-hour link (FR-DATA-005). */
export async function serverExport(kind: string, format: string, filters: Record<string, string>): Promise<string | null> {
  const r = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, format, filters }) });
  const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (d.url) {
    window.open(d.url, "_blank", "noopener");
    return null;
  }
  return d.error ?? "Export failed";
}
