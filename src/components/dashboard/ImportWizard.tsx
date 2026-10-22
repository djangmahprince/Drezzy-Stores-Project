"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { importCatalogue, type ImportResult } from "@/app/dashboard/catalogue/import/actions";
import { Pill } from "@/components/dashboard/DashShell";
import { templateCsv } from "@/lib/catalogue/import";
import { formatGHS } from "@/lib/data";

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([templateCsv()], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "drezzy-catalogue-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportWizard() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  function run(mode: "preview" | "commit") {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mode", mode);
    start(async () => setResult(await importCatalogue(fd)));
  }

  const done = result?.mode === "commit" && result.ok;
  const s = result?.summary;

  return (
    <div className="max-w-3xl space-y-4">
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">1. Get your list into the template</h2>
        <p className="text-sm text-text2">One row per size. Rows for the same product (brand and name) are grouped automatically. Use <b>Category</b> like <i>Sneakers &gt; Men</i>. Leave <b>Availability</b> blank for anything a supplier has not confirmed yet.</p>
        <button type="button" onClick={downloadTemplate} className="btn-outline !min-h-10">Download the template (CSV)</button>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">2. Choose your file</h2>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Spreadsheet file"
          className="block w-full text-sm file:mr-3 file:rounded-[12px] file:border-0 file:bg-navy file:px-4 file:py-2.5 file:font-semibold file:text-white"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
        />
        <button type="button" className="btn-primary !min-h-10 disabled:opacity-60" disabled={!file || pending} onClick={() => run("preview")}>{pending && !result ? "Checking…" : "Check the file"}</button>
        <p className="text-xs text-text2">Nothing is saved at this step.</p>
      </section>

      {result?.error && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-4 py-3 text-sm font-medium text-error">{result.error}</p>}

      {result && result.issues.length > 0 && (
        <section className="card space-y-3 p-5" aria-live="polite">
          <h2 className="font-semibold text-error">{result.issues.length} {result.issues.length === 1 ? "problem" : "problems"} to fix</h2>
          <p className="text-sm text-text2">Fix these in your file and check it again. Nothing was imported.</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {result.issues.map((i, n) => <li key={n}><b>Line {i.line}:</b> {i.message}</li>)}
          </ul>
        </section>
      )}

      {s && result?.ok && (
        <section className="card space-y-4 p-5" aria-live="polite">
          <h2 className="font-semibold">{done ? "Imported" : "3. Check, then import"}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[["Rows", s.rows], ["Products", s.products], ["New products", s.newProducts], ["Updated products", s.updatedProducts], ["New sizes", s.newVariants], ["Updated sizes", s.updatedVariants], ["New suppliers", s.newSuppliers]].map(([k, v]) => (
              <div key={String(k)} className="rounded-[12px] bg-card p-3"><dt className="text-text2">{k}</dt><dd className="text-xl font-bold">{v}</dd></div>
            ))}
          </dl>
          {!done && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-line text-text2"><tr>{["Line", "Product", "Style", "Colour", "Size", "Price", "Availability"].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{result.sample.map((r) => (
                    <tr key={r.line} className="border-b border-line last:border-0"><td className="py-2 pr-3">{r.line}</td><td className="pr-3">{r.product}</td><td className="pr-3">{r.style ?? "–"}</td><td className="pr-3">{r.colour}</td><td className="pr-3">{r.size}</td><td className="pr-3">{formatGHS(r.price)}</td><td><Pill tone={r.availability === "Available" ? "ok" : r.availability === "Limited" ? "warn" : "info"}>{r.availability}</Pill></td></tr>
                  ))}</tbody>
                </table>
                {s.rows > result.sample.length && <p className="mt-2 text-xs text-text2">Showing the first {result.sample.length} of {s.rows} rows.</p>}
              </div>
              <p className="rounded-[12px] bg-[#eef1fb] p-3 text-sm">New products are added as <b>drafts</b>, so nothing appears on the storefront until you publish it. Existing sizes are updated with the prices and availability in your file.</p>
              <button type="button" className="btn-lime disabled:opacity-60" disabled={pending} onClick={() => run("commit")}>{pending ? "Importing…" : `Import ${s.rows} ${s.rows === 1 ? "row" : "rows"}`}</button>
            </>
          )}
          {done && (
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/catalogue" className="btn-primary">Open the catalogue</Link>
              <button type="button" className="btn-outline" onClick={() => { setFile(null); setResult(null); if (input.current) input.current.value = ""; }}>Import another file</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
