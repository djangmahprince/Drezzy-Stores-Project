"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { markProductChecked, saveVariants, setProductPublished } from "@/app/dashboard/catalogue/actions";
import { Pill } from "@/components/dashboard/DashShell";
import { Icon } from "@/components/Icon";
import { ProductPhoto } from "@/components/ProductPhoto";
import type { StaffCatalogue, StaffProduct, StaffVariant, VariantChange } from "@/lib/catalogue/staff-types";
import type { Availability } from "@/lib/catalogue/types";
import { useNow } from "@/lib/now";

const avail: Availability[] = ["Available", "Limited", "Unavailable", "Pre-order"];
const availCls = { Available: "text-success", Limited: "text-warning", Unavailable: "text-error", "Pre-order": "text-navy" } as const;
const num = "w-20 rounded-[10px] border border-line bg-white px-2 py-1.5 text-sm disabled:bg-card disabled:text-muted";
const selCls = "rounded-[10px] border border-line bg-white px-2 py-1.5 text-sm disabled:bg-card disabled:text-muted";

type Draft = Partial<Pick<VariantChange, "price" | "availability" | "leadDays" | "supplierId" | "cost" | "expectedOn">>;

const dateOf = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short", timeZone: "Africa/Accra" }) : "Never");

/** Applies a draft's edits to a variant: supplierId is the preferred supplier, cost is that supplier's offer. */
function applyDraft(v: StaffVariant, d: Draft): StaffVariant {
  const next: StaffVariant = { ...v };
  if (d.price !== undefined) next.price = d.price;
  if (d.availability !== undefined) next.availability = d.availability;
  if (d.leadDays !== undefined) next.leadDays = d.leadDays;
  if (d.supplierId !== undefined) next.preferredSupplierId = d.supplierId ?? undefined;
  if (d.expectedOn !== undefined) next.expectedOn = d.expectedOn ?? undefined;
  const sid = d.supplierId === undefined ? v.preferredSupplierId : (d.supplierId ?? undefined);
  if (d.cost != null && sid) next.offers = [...v.offers.filter((o) => o.supplierId !== sid), { supplierId: sid, cost: d.cost, available: true }];
  return next;
}

export function CatalogueManager({ data }: { data: StaffCatalogue }) {
  const { rights, suppliers, mode, staleDays, supplierOrders } = data;
  const now = useNow();
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<StaffProduct[]>(data.products);
  const [tab, setTab] = useState("All");
  const [slug, setSlug] = useState(data.products[0]?.slug ?? "");
  const [style, setStyle] = useState<string | undefined>();
  const [colour, setColour] = useState<string | undefined>();
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [pending, start] = useTransition();

  const p = products.find((x) => x.slug === slug) ?? products[0];
  const tabs = useMemo(() => ["All", ...new Set(["Sneakers", "Shoes", "Shirts", "Loafers", "Watches", ...products.map((x) => x.category)]), "Not checked", "Drafts", "Archived"], [products]);
  // sizes on sale whose availability has not been confirmed within the limit set in Settings (FR-CAT-005)
  const unchecked = (x: StaffProduct) => !x.archived && x.variants.some((v) => v.availability !== "Unavailable" && (!v.lastCheckedAt || (now !== null && now - Date.parse(v.lastCheckedAt) > staleDays * 86_400_000)));
  const term = q.trim().toLowerCase();
  const list = products
    .filter((x) => (tab === "Archived" ? x.archived : x.archived ? false : tab === "All" ? true : tab === "Drafts" ? !x.published : tab === "Not checked" ? unchecked(x) : x.category === tab))
    .filter((x) => !term || `${x.name} ${x.brand} ${x.sku} ${x.tags.join(" ")} ${x.variants.map((v) => `${v.sku} ${suppliers.find((s) => s.id === v.preferredSupplierId)?.name ?? ""}`).join(" ")}`.toLowerCase().includes(term));

  if (!p) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <p className="text-lg font-semibold">No products yet</p>
        <p className="max-w-sm text-sm text-text2">Add your first product, or import your Excel list.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {rights.canCreate && <Link href="/dashboard/catalogue/new" className="btn-primary">Add product</Link>}
          {rights.canCreate && <Link href="/dashboard/catalogue/import" className="btn-outline">Import from Excel</Link>}
        </div>
      </div>
    );
  }

  const styleNow = p.styles ? (style && p.styles.includes(style) ? style : p.styles[0]) : undefined;
  const colourNow = colour && p.colours.includes(colour) ? colour : p.colours[0];
  const rows = p.variants.filter((v) => v.colour === colourNow && (v.style ?? undefined) === styleNow);
  const view = (v: StaffVariant): StaffVariant & { cost?: number } => {
    const d = draft[v.id] ?? {};
    const offer = v.offers.find((o) => o.supplierId === (d.supplierId ?? v.preferredSupplierId));
    return {
      ...v,
      price: d.price ?? v.price,
      availability: d.availability ?? v.availability,
      leadDays: d.leadDays ?? v.leadDays,
      expectedOn: d.expectedOn === undefined ? v.expectedOn : (d.expectedOn ?? undefined),
      preferredSupplierId: d.supplierId === undefined ? v.preferredSupplierId : (d.supplierId ?? undefined),
      cost: d.cost === undefined ? offer?.cost : (d.cost ?? undefined),
    };
  };

  const open = p.variants.filter((v) => (draft[v.id]?.availability ?? v.availability) !== "Unavailable").length;
  const dirty = Object.keys(draft).length;
  const edit = (id: string, patch: Draft) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const flash = (text: string, bad = false) => {
    setMsg({ text, bad });
    window.setTimeout(() => setMsg(null), 4500);
  };

  function save() {
    const changes: VariantChange[] = Object.entries(draft).map(([id, d]) => ({ id, ...d }));
    if (mode === "demo") {
      // Design preview: apply the edits in memory only.
      setProducts((all) => all.map((x) => ({ ...x, variants: x.variants.map((v) => (draft[v.id] ? applyDraft(v, draft[v.id]) : v)) })));
      setDraft({});
      flash("Applied for this preview only. Connect Supabase to save for real.");
      return;
    }
    start(async () => {
      const res = await saveVariants(changes);
      if (res.error) return flash(res.error, true);
      const bad = Object.fromEntries(res.errors.map((e) => [e.id, e.message]));
      setRowErrors(bad);
      // keep only the edits that failed, so they can be fixed and retried
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([id]) => bad[id])));
      flash(res.ok ? `Saved ${res.saved} ${res.saved === 1 ? "change" : "changes"}. The storefront has updated.` : `Saved ${res.saved}, ${res.errors.length} need attention.`, !res.ok);
      if (res.saved > 0) setProducts((all) => all.map((x) => ({ ...x, variants: x.variants.map((v) => (draft[v.id] && !bad[v.id] ? applyDraft(v, draft[v.id]) : v)) })));
    });
  }

  function markChecked() {
    const now = new Date().toISOString();
    const apply = () => setProducts((all) => all.map((x) => (x.slug === p.slug ? { ...x, variants: x.variants.map((v) => ({ ...v, lastCheckedAt: now })) } : x)));
    if (mode === "demo") return apply();
    start(async () => {
      const r = await markProductChecked(p.id);
      if (!r.ok) return flash(r.error ?? "Could not update.", true);
      apply();
      flash("Marked as checked with suppliers today.");
    });
  }

  function togglePublish() {
    const next = !p.published;
    const apply = () => setProducts((all) => all.map((x) => (x.slug === p.slug ? { ...x, published: next } : x)));
    if (mode === "demo") return apply();
    start(async () => {
      const r = await setProductPublished(p.id, next);
      if (!r.ok) return flash(r.error ?? "Could not update.", true);
      apply();
      flash(next ? "Published. It is on the storefront now." : "Unpublished. It is hidden from the storefront.");
    });
  }

  function setAll(a: Availability) {
    rows.forEach((v) => edit(v.id, { availability: a }));
  }


  const orders = supplierOrders.filter((o) => o.productIds.includes(p.id)).slice(0, 6);
  const statusWord = { ordered: "Ordered", received: "Received", failed: "Failed" } as const;
  const statusCls = { ordered: "text-navy", received: "text-success", failed: "text-error" } as const;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {rights.canCreate && <Link href="/dashboard/catalogue/import" className="btn-outline !min-h-11"><Icon name="download" size={18} /> Import from Excel</Link>}
        <Link href="/dashboard/catalogue/suppliers" className="btn-outline !min-h-11">Suppliers</Link>
        <Link href="/dashboard/catalogue/reports" className="btn-outline !min-h-11">Reports</Link>
        {rights.canCreate && <Link href="/dashboard/catalogue/new" className="btn-primary !min-h-11">Add product</Link>}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <section className="card p-3">
          <div className="relative">
            <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand, SKU or supplier" aria-label="Find a product" className="field !min-h-11 !pl-10 !text-sm" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Catalogue filter">
            {tabs.map((t) => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`rounded-[8px] px-2.5 py-1.5 text-xs font-semibold ${tab === t ? "bg-navy text-white" : t === "Not checked" ? "bg-[#fbeedb] text-warning" : "bg-card text-text2"}`}>
                {t === "Not checked" ? `Not checked ${staleDays} days (${products.filter(unchecked).length})` : t === "Drafts" ? `Drafts (${products.filter((x) => !x.published && !x.archived).length})` : t}
              </button>
            ))}
          </div>
          <ul className="mt-3 max-h-[70vh] space-y-1 overflow-y-auto">
            {list.map((x) => {
              const n = x.variants.filter((v) => v.availability !== "Unavailable").length;
              const stale = unchecked(x);
              return (
                <li key={x.slug}>
                  <button type="button" onClick={() => setSlug(x.slug)} aria-current={x.slug === p.slug} className={`flex w-full items-center gap-3 rounded-[12px] border-2 p-2 text-left text-sm transition-colors ${x.slug === p.slug ? "border-navy bg-[#eef1fb]" : "border-transparent hover:bg-card"}`}>
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-[8px] bg-card"><ProductPhoto product={x} label="" sizes="44px" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{x.name}</span><span className="block truncate text-xs text-text2">{x.category}{x.styles ? ` · ${x.styles.length} styles` : ""}{x.colours.length > 1 ? ` · ${x.colours.length} colours` : ""}</span></span>
                    {x.archived ? <Pill tone="bad">Archived</Pill> : !x.published ? <Pill tone="info">Draft</Pill> : stale ? <Pill tone="warn">Not checked</Pill> : <span className="shrink-0 text-xs font-semibold text-success">{x.variants.length === 1 ? x.variants[0].availability : `${n} of ${x.variants.length} sizes`}</span>}
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="p-6 text-center text-sm text-text2">Nothing here. Nice.</li>}
          </ul>
        </section>

        <div className="min-w-0 space-y-4" aria-live="polite">
          <section className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative size-14 shrink-0 overflow-hidden rounded-[10px] bg-card"><ProductPhoto product={p} label="" sizes="56px" /></span>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-navy">{p.name}</h2>
                  <p className="text-sm text-text2">{p.brand} · {p.category} · {p.condition} · Sourced on order</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {rights.canEditPrice && mode === "db" && <Link href={`/dashboard/catalogue/${p.id}`} className="text-sm font-semibold text-navy underline">Edit details and photos</Link>}
                {p.published && <Link href={`/product/${p.slug}`} target="_blank" className="text-sm font-semibold text-navy underline">View</Link>}
                <label className={`flex items-center gap-2 text-sm font-medium ${rights.canEditPrice ? "cursor-pointer" : ""}`}>
                  <input type="checkbox" role="switch" className="peer sr-only" checked={p.published} disabled={!rights.canEditPrice || pending} onChange={togglePublish} />
                  <span className="relative h-6 w-11 rounded-full bg-muted transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-success peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-navy" aria-hidden="true" />
                  Visible on storefront
                </label>
              </div>
            </div>

            {(p.styles || p.colours.length > 1) && (
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                {p.styles && (
                  <div className="text-sm"><p className="mb-1 text-text2">Style</p><div className="flex flex-wrap gap-2">
                    {p.styles.map((s) => <button key={s} type="button" aria-pressed={styleNow === s} onClick={() => setStyle(s)} className={`min-h-10 rounded-[10px] border px-3 font-semibold ${styleNow === s ? "border-navy bg-navy text-white" : "border-line bg-white text-ink"}`}>{s}</button>)}
                  </div></div>
                )}
                {p.colours.length > 1 && (
                  <div className="text-sm"><p className="mb-1 text-text2">Colour</p><div className="flex flex-wrap gap-2">
                    {p.colours.map((c) => <button key={c} type="button" aria-pressed={colourNow === c} onClick={() => setColour(c)} className={`min-h-10 rounded-[10px] border px-3 font-semibold ${colourNow === c ? "border-navy bg-navy text-white" : "border-line bg-white text-ink"}`}>{c}</button>)}
                  </div></div>
                )}
              </div>
            )}
            <p className="mb-2 mt-3 text-sm text-text2">{open} of {p.variants.length} sizes can be supplied{!rights.canEditPrice && !rights.canEditAvailability ? " · view only" : ""}</p>

            <div className="overflow-x-auto rounded-[12px] border border-line">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-line text-text2">
                  <tr>{["Size", "SKU", "Price (GHS)", "Best supplier", ...(rights.canSeeCosts ? ["Cost (GHS)", "Margin"] : []), "Availability", "Lead (days)", "Checked"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((v0) => {
                    const v = view(v0);
                    const changed = !!draft[v0.id];
                    const margin = v.cost && v.price ? Math.round(((v.price - v.cost) / v.price) * 100) : null;
                    return (
                      <tr key={v0.id} className={`border-b border-line align-top last:border-0 ${changed ? "bg-[#fffbe8]" : ""}`}>
                        <td className="px-3 py-2 font-semibold">{v.size}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-text2">{v.sku}</td>
                        <td className="px-3 py-2"><input aria-label={`Price for ${v.size}`} type="number" min={0} step="1" className={num} disabled={!rights.canEditPrice} value={v.price} onChange={(e) => edit(v0.id, { price: Number(e.target.value) })} /></td>
                        <td className="px-3 py-2">
                          <select aria-label={`Supplier for ${v.size}`} className={selCls} disabled={!rights.canEditAvailability} value={v.preferredSupplierId ?? ""} onChange={(e) => edit(v0.id, { supplierId: e.target.value || null })}>
                            <option value="">None</option>
                            {suppliers.filter((s) => s.active || s.id === v.preferredSupplierId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </td>
                        {rights.canSeeCosts && (
                          <>
                            <td className="px-3 py-2"><input aria-label={`Cost for ${v.size}`} type="number" min={0} step="1" placeholder="–" className={num} disabled={!rights.canEditAvailability || !v.preferredSupplierId} value={v.cost ?? ""} onChange={(e) => edit(v0.id, { cost: e.target.value === "" ? null : Number(e.target.value), supplierId: v.preferredSupplierId ?? null })} /></td>
                            <td className={`px-3 py-2 font-medium ${margin !== null && margin < 10 ? "text-error" : "text-text2"}`}>{margin === null ? "–" : `${margin}%`}</td>
                          </>
                        )}
                        <td className="px-3 py-2">
                          <select aria-label={`Availability for ${v.size}`} className={`${selCls} font-medium ${availCls[v.availability]}`} disabled={!rights.canEditAvailability} value={v.availability} onChange={(e) => edit(v0.id, { availability: e.target.value as Availability })}>
                            {avail.map((a) => <option key={a}>{a}</option>)}
                          </select>
                          {v.availability === "Pre-order" && <input aria-label={`Expected date for ${v.size}`} type="date" className={`${selCls} mt-1 block`} disabled={!rights.canEditAvailability} value={v.expectedOn ?? ""} onChange={(e) => edit(v0.id, { expectedOn: e.target.value || null })} />}
                          {rowErrors[v0.id] && <p role="alert" className="mt-1 max-w-48 text-xs font-medium text-error">{rowErrors[v0.id]}</p>}
                        </td>
                        <td className="px-3 py-2"><input aria-label={`Lead time for ${v.size}`} type="number" min={0} max={60} className="w-16 rounded-[10px] border border-line bg-white px-2 py-1.5 text-sm disabled:bg-card" disabled={!rights.canEditAvailability} value={v.leadDays} onChange={(e) => edit(v0.id, { leadDays: Number(e.target.value) })} /></td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-text2">{dateOf(v0.lastCheckedAt)}{rights.canSeeCosts && v.offers.length > 1 ? ` · best of ${v.offers.length}: GHS ${Math.min(...v.offers.filter((o) => o.available).map((o) => o.cost))}` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {rights.canEditAvailability && (
                <>
                  <button type="button" className="text-sm font-semibold text-navy underline" onClick={markChecked} disabled={pending}>Mark all as checked with suppliers today</button>
                  <label className="flex items-center gap-2 text-sm text-text2">Set these sizes to
                    <select aria-label="Set all shown sizes" className={selCls} value="" onChange={(e) => e.target.value && setAll(e.target.value as Availability)}>
                      <option value="">Choose…</option>{avail.map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </label>
                </>
              )}
              <div className="ml-auto flex items-center gap-3">
                {dirty > 0 && (
                  <>
                    <button type="button" className="text-sm text-text2 underline" onClick={() => { setDraft({}); setRowErrors({}); }}>Discard</button>
                    <span className="text-sm font-medium text-warning">{dirty} unsaved {dirty === 1 ? "change" : "changes"}</span>
                  </>
                )}
                <button type="button" className="btn-lime !min-h-11 disabled:opacity-50" disabled={!dirty || pending} onClick={save}>{pending ? "Saving…" : "Save and publish"}</button>
              </div>
            </div>
            {msg && <p role={msg.bad ? "alert" : "status"} className={`mt-3 rounded-[12px] px-4 py-3 text-sm font-medium ${msg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
            {mode === "demo" && <p className="mt-3 text-xs text-text2">Design preview: edits are not saved anywhere. Connect Supabase to manage the real catalogue.</p>}
          </section>

          <section className="card p-4">
            <div className="flex items-baseline justify-between gap-2"><h2 className="font-semibold">Supplier orders for this product</h2><Link href="/dashboard/catalogue/supplier-orders" className="text-sm font-semibold text-navy underline">All supplier orders</Link></div>
            {orders.length === 0 ? <p className="mt-3 text-sm text-text2">No supplier orders yet.</p> : (
              <ul className="mt-2 divide-y divide-line text-sm">
                {orders.map((o) => <li key={o.id} className="grid gap-x-4 py-2 sm:grid-cols-[90px_1fr_auto]"><b className={statusCls[o.status]}>{statusWord[o.status]}</b><span>{o.text}</span><span className="text-text2">{dateOf(o.at)}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
