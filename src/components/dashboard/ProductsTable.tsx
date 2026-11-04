"use client";

import Link from "next/link";
import { useState } from "react";
import { CatalogueBulkBar } from "@/components/dashboard/CatalogueBulkBar";
import { ColumnChooser, SavedViews, useColumns } from "@/components/dashboard/ListTools";
import { Pill } from "@/components/dashboard/DashShell";
import { ProductPhoto } from "@/components/ProductPhoto";
import type { StaffCatalogue, StaffProduct } from "@/lib/catalogue/staff-types";

const COLS = ["Category", "Brand", "Price", "Sizes", "Status", "Tags"];
const statusOf = (p: StaffProduct) => (p.archived ? "Archived" : p.published ? "Active" : "Draft");
const sorters: Record<string, (a: StaffProduct, b: StaffProduct) => number> = {
  Product: (a, b) => a.name.localeCompare(b.name), Category: (a, b) => a.category.localeCompare(b.category), Brand: (a, b) => a.brand.localeCompare(b.brand),
  Price: (a, b) => a.price - b.price, Status: (a, b) => statusOf(a).localeCompare(statusOf(b)),
};

/** Manage catalogue (PRD key screens): the table with search, filters, sorting, a column chooser, saved views and bulk edit. */
export function ProductsTable({ data }: { data: StaffCatalogue }) {
  const { products, rights, categories, mode } = data;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ by: string; up: boolean }>({ by: "Product", up: true });
  const [selected, setSelected] = useState<string[]>([]);
  const { cols, toggle } = useColumns("products", COLS, COLS);
  const term = q.trim().toLowerCase();
  const rows = products
    .filter((p) => (!cat || p.category === cat) && (!status || statusOf(p) === status) && (!term || `${p.name} ${p.brand} ${p.sku} ${p.tags.join(" ")}`.toLowerCase().includes(term)))
    .sort((a, b) => (sort.up ? 1 : -1) * (sorters[sort.by] ?? sorters.Product)(a, b));
  const head = (h: string) => (
    <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium" aria-sort={sort.by === h ? (sort.up ? "ascending" : "descending") : undefined}>
      {sorters[h] ? <button type="button" onClick={() => setSort((s) => ({ by: h, up: s.by === h ? !s.up : true }))}>{h}{sort.by === h ? (sort.up ? " ↑" : " ↓") : ""}</button> : h}
    </th>
  );
  const on = (c: string) => cols.includes(c);
  const sel = "min-h-11 rounded-[12px] border border-line bg-white px-3 text-sm";
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name, brand, SKU or tag" aria-label="Find a product" className="field !min-h-11 max-w-xs flex-1 !text-sm" />
        <select aria-label="Category" className={sel} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{[...new Set(products.map((p) => p.category))].map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Status" className={sel} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option>Active</option><option>Draft</option><option>Archived</option></select>
        <ColumnChooser all={COLS} cols={cols} toggle={toggle} />
        <SavedViews list="products" current={{ q, cat, status }} onApply={(v) => { setQ(v.q ?? ""); setCat(v.cat ?? ""); setStatus(v.status ?? ""); }} />
        {rights.canCreate && <Link href="/dashboard/catalogue/new" className="btn-primary !min-h-11 ml-auto">Add product</Link>}
      </div>
      {(rights.canEditPrice || rights.canEditAvailability) && <CatalogueBulkBar selected={selected} shown={rows.map((p) => p.id)} onSelect={setSelected} rights={rights} categories={categories} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-text2"><tr><th className="w-10 px-3" />{head("Product")}{COLS.filter(on).map(head)}</tr></thead>
          <tbody>
            {rows.map((p) => {
              const open = p.variants.filter((v) => v.availability !== "Unavailable").length;
              const st = statusOf(p);
              return (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-3"><label><span className="sr-only">Select {p.name}</span><input type="checkbox" className="size-4 accent-[#00115b]" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((id) => id !== p.id)))} /></label></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="relative size-11 shrink-0 overflow-hidden rounded-[8px] bg-card"><ProductPhoto product={p} label="" sizes="44px" /></span>
                      <span className="min-w-0">{mode === "db" ? <Link href={`/dashboard/catalogue/${p.id}`} className="font-semibold text-navy underline">{p.name}</Link> : <b>{p.name}</b>}<span className="block text-xs text-text2">{p.sku}</span></span>
                    </div>
                  </td>
                  {on("Category") && <td className="px-3 py-2">{p.category}</td>}
                  {on("Brand") && <td className="px-3 py-2">{p.brand}</td>}
                  {on("Price") && <td className="whitespace-nowrap px-3 py-2">{p.priceVaries ? "From " : ""}GHS {p.price}</td>}
                  {on("Sizes") && <td className="whitespace-nowrap px-3 py-2">{open} of {p.variants.length}</td>}
                  {on("Status") && <td className="px-3 py-2"><Pill tone={st === "Active" ? "ok" : st === "Draft" ? "info" : "bad"}>{st}</Pill></td>}
                  {on("Tags") && <td className="px-3 py-2 text-text2">{p.tags.join(", ")}</td>}
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-text2">No products match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
