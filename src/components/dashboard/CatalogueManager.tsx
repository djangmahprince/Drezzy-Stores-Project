"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { markProductChecked, saveVariants, setProductPublished } from "@/app/dashboard/catalogue/actions";
import { Pill } from "@/components/dashboard/DashShell";
import type { StaffCatalogue, StaffProduct, StaffVariant, VariantChange } from "@/lib/catalogue/staff-types";
import type { Availability } from "@/lib/catalogue/types";

const avail: Availability[] = ["Available", "Limited", "Unavailable", "Pre-order"];
const tone = { Available: "ok", Limited: "warn", Unavailable: "bad", "Pre-order": "info" } as const;
const num = "w-20 rounded-[10px] border border-line bg-white px-2 py-1.5 text-sm disabled:bg-card disabled:text-muted";
const selCls = "rounded-[10px] border border-line bg-white px-2 py-1.5 text-sm disabled:bg-card disabled:text-muted";

type Draft = Partial<Pick<VariantChange, "price" | "availability" | "leadDays" | "supplierId" | "cost">>;

const dateOf = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short", timeZone: "Africa/Accra" }) : "Never");

/** Applies a draft's edits to a variant: supplierId is the preferred supplier, cost is that supplier's offer. */
function applyDraft(v: StaffVariant, d: Draft): StaffVariant {
  const next: StaffVariant = { ...v };
  if (d.price !== undefined) next.price = d.price;
  if (d.availability !== undefined) next.availability = d.availability;
  if (d.leadDays !== undefined) next.leadDays = d.leadDays;
  if (d.supplierId !== undefined) next.preferredSupplierId = d.supplierId ?? undefined;
  const sid = d.supplierId === undefined ? v.preferredSupplierId : (d.supplierId ?? undefined);
  if (d.cost != null && sid) next.offers = [...v.offers.filter((o) => o.supplierId !== sid), { supplierId: sid, cost: d.cost, available: true }];
  return next;
}

export function CatalogueManager({ data }: { data: StaffCatalogue }) {
  const { rights, suppliers, mode } = data;
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
  const tabs = useMemo(() => ["All", ...new Set(products.map((x) => x.category)), "Drafts", "Not checked"], [products]);
  const unchecked = (x: StaffProduct) => x.variants.some((v) => !v.lastCheckedAt);
  const list = products.filter((x) => (tab === "All" ? true : tab === "Drafts" ? !x.published : tab === "Not checked" ? unchecked(x) : x.category === tab));

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

  const supName = (id?: string) => suppliers.find((s) => s.id === id)?.name;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/dashboard/catalogue/suppliers" className="btn-outline !min-h-10">Suppliers</Link>
        {rights.canCreate && <Link href="/dashboard/catalogue/import" className="btn-outline !min-h-10">Import from Excel</Link>}
        {rights.canCreate && <Link href="/dashboard/catalogue/new" className="btn-primary !min-h-10">Add product</Link>}
      </div>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Catalogue filter">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`chip min-h-9 px-3 ${tab === t ? "bg-navy text-white" : "bg-white text-navy"}`}>
            {t === "Not checked" ? `Not checked (${products.filter(unchecked).length})` : t === "Drafts" ? `Drafts (${products.filter((x) => !x.published).length})` : t}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ul className="card max-h-[72vh] divide-y divide-line overflow-y-auto">
          {list.map((x) => {
            const n = x.variants.filter((v) => v.availability !== "Unavailable").length;
            return (
              <li key={x.slug}>
                <button type="button" onClick={() => setSlug(x.slug)} aria-current={x.slug === p.slug} className={`w-full p-3 text-left text-sm transition-colors hover:bg-card ${x.slug === p.slug ? "bg-[#eef1fb]" : ""}`}>
                  <p className="font-semibold">{x.name}</p>
                  <p className="text-text2">{x.category}{x.subcategory ? ` › ${x.subcategory}` : ""} · {x.audience}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2">{n} of {x.variants.length} sizes {!x.published && <Pill tone="info">Draft</Pill>}{unchecked(x) && <Pill tone="warn">Not checked</Pill>}</p>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="p-6 text-center text-sm text-text2">Nothing here. Nice.</li>}
        </ul>

        <section aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <p className="mb-3 text-sm text-text2">{p.brand} · {p.category} · {p.condition} · Sourced on order · SKU {p.sku} · {p.published ? "Visible on storefront" : "Draft, not on the storefront"}</p>
            </div>
            <div className="flex gap-2">
              {p.published && <Link href={`/product/${p.slug}`} target="_blank" className="btn-outline !min-h-10">View on storefront</Link>}
              {rights.canEditPrice && <button type="button" onClick={togglePublish} disabled={pending} className="btn-outline !min-h-10">{p.published ? "Unpublish" : "Publish"}</button>}
            </div>
          </div>

          {(p.styles || p.colours.length > 1) && (
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2">
              {p.styles && (
                <div className="flex items-center gap-2 text-sm"><span className="text-text2">Style</span>
                  {p.styles.map((s) => <button key={s} type="button" aria-pressed={styleNow === s} onClick={() => setStyle(s)} className={`chip min-h-9 px-3 ${styleNow === s ? "bg-navy text-white" : "bg-white text-navy"}`}>{s}</button>)}
                </div>
              )}
              {p.colours.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-text2">Colour</span>
                  {p.colours.map((c) => <button key={c} type="button" aria-pressed={colourNow === c} onClick={() => setColour(c)} className={`chip min-h-9 px-3 ${colourNow === c ? "bg-navy text-white" : "bg-white text-navy"}`}>{c}</button>)}
                </div>
              )}
            </div>
          )}
          <p className="mb-2 text-sm text-text2">{open} of {p.variants.length} sizes can be supplied{!rights.canEditPrice && !rights.canEditAvailability ? " · view only" : ""}</p>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line text-text2">
                <tr>{["Size", "SKU", "Price (GHS)", "Best supplier", ...(rights.canSeeCosts ? ["Cost (GHS)", "Margin"] : []), "Availability", "Lead (days)", "Checked"].map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr>
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
                        <select aria-label={`Availability for ${v.size}`} className={selCls} disabled={!rights.canEditAvailability} value={v.availability} onChange={(e) => edit(v0.id, { availability: e.target.value as Availability })}>
                          {avail.map((a) => <option key={a}>{a}</option>)}
                        </select>
                        <span className="ml-2 hidden xl:inline"><Pill tone={tone[v.availability]}>{v.availability}</Pill></span>
                        {rowErrors[v0.id] && <p role="alert" className="mt-1 max-w-48 text-xs font-medium text-error">{rowErrors[v0.id]}</p>}
                      </td>
                      <td className="px-3 py-2"><input aria-label={`Lead time for ${v.size}`} type="number" min={0} max={60} className="w-16 rounded-[10px] border border-line bg-white px-2 py-1.5 text-sm disabled:bg-card" disabled={!rights.canEditAvailability} value={v.leadDays} onChange={(e) => edit(v0.id, { leadDays: Number(e.target.value) })} /></td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-text2">{dateOf(v0.lastCheckedAt)}{supName(v.preferredSupplierId) ? ` · ${supName(v.preferredSupplierId)}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {rights.canEditAvailability && (
              <>
                <button type="button" className="btn-outline" onClick={markChecked} disabled={pending}>Mark all as checked with suppliers today</button>
                <label className="flex items-center gap-2 text-sm text-text2">Set these sizes to
                  <select aria-label="Set all shown sizes" className={selCls} value="" onChange={(e) => e.target.value && setAll(e.target.value as Availability)}>
                    <option value="">Choose…</option>{avail.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </label>
              </>
            )}
            <button type="button" className="btn-primary" disabled={!dirty || pending} onClick={save}>{pending ? "Saving…" : "Save and publish"}</button>
            {dirty > 0 && (
              <>
                <span className="text-sm font-medium text-warning">{dirty} unsaved {dirty === 1 ? "change" : "changes"}</span>
                <button type="button" className="text-sm text-text2 underline" onClick={() => { setDraft({}); setRowErrors({}); }}>Discard</button>
              </>
            )}
          </div>
          {msg && <p role={msg.bad ? "alert" : "status"} className={`mt-3 rounded-[12px] px-4 py-3 text-sm font-medium ${msg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
          {mode === "demo" && <p className="mt-3 text-xs text-text2">Design preview: edits are not saved anywhere. Connect Supabase to manage the real catalogue.</p>}
        </section>
      </div>
    </div>
  );
}
