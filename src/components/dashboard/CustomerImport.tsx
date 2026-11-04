"use client";

import { useState, useTransition } from "react";
import { importCustomersAction } from "@/app/dashboard/customers/actions";

/** Splits CSV text into rows, handling quoted cells. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const COLS = ["name", "phone", "email", "region", "source", "tags", "consent"];

export function CustomerImport() {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; problem: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <div className="card space-y-2 p-4 text-sm">
        <p>Columns (first row): <code>{COLS.join(", ")}</code>. Tags are separated by semicolons. Consent is yes or no: only people who agreed get marketing.</p>
        <a className="text-navy underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent(COLS.join(",") + "\nAma Mensah,024 000 0000,ama@example.com,Greater Accra,WhatsApp,vip;sneakers,yes\n")}`} download="drezzy-customers-template.csv">Download the template</a>
        <input type="file" accept=".csv,text/csv" className="field py-2" aria-label="CSV file" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const table = parseCsv(await file.text());
          const head = table[0].map((h) => h.trim().toLowerCase());
          if (!head.includes("phone") || !head.includes("name")) return setError("The first row must name the columns, including name and phone.");
          setError(null);
          setResult(null);
          setRows(table.slice(1, 5001).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()]))));
        }} />
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {rows.length > 0 && !result && (
        <div className="card space-y-3 p-4 text-sm">
          <p><b>{rows.length}</b> rows ready. Nothing is saved until you confirm. Existing customers (same phone) are updated, not duplicated.</p>
          <div className="max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead><tr>{COLS.map((c) => <th key={c} className="p-1">{c}</th>)}</tr></thead><tbody>{rows.slice(0, 20).map((r, i) => <tr key={i} className="border-t border-line">{COLS.map((c) => <td key={c} className="p-1">{r[c]}</td>)}</tr>)}</tbody></table></div>
          <button disabled={pending} className="btn-primary" onClick={() => start(async () => { const r = await importCustomersAction(rows); if (r.ok) setResult(r.data!); else setError(r.error); })}>{pending ? "Importing…" : `Import ${rows.length} customers`}</button>
        </div>
      )}
      {result && (
        <div className="card space-y-2 p-4 text-sm">
          <p className="font-semibold text-success">{result.created} added · {result.updated} updated · {result.errors.length} skipped</p>
          {result.errors.length > 0 && <ul className="list-disc pl-5 text-error">{result.errors.slice(0, 50).map((e) => <li key={e.row}>Row {e.row + 1}: {e.problem}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
