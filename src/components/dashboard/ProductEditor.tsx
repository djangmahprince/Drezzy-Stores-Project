"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { saveProductAction, setSaleAction, type ProductValues } from "@/app/dashboard/catalogue/tools-actions";
import { mediaUploadAction } from "@/app/dashboard/content/actions";
import type { ProductEdit } from "@/lib/catalogue/staff-types";
import { publicFile } from "@/lib/media";

type Msg = { text: string; bad?: boolean } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role={m.bad ? "alert" : "status"} className={`rounded-[12px] px-3 py-2 text-sm ${m.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{m.text}</p> : null);
const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const toIso = (local: string) => (local ? new Date(`${local}Z`).toISOString() : null); // Ghana is on UTC all year

const audiences: [string, string][] = [["men", "Men"], ["ladies", "Ladies"], ["men_and_ladies", "Men and ladies"], ["unisex", "Unisex"]];
const audienceWord = (db: string) => audiences.find(([k]) => k === db)?.[1] ?? "Unisex";

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}><span className="mb-1 block font-medium">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-text2">{hint}</span>}</label>;
}

/** Full product details (FR-CAT-001): photos, text, tags, status, drop settings, sale and search listing. */
export function ProductEditor({ p, categories }: { p: ProductEdit; categories: { id: string; label: string }[] }) {
  const [v, setV] = useState({
    name: p.name, brand: p.brand, categoryId: p.categoryId, audience: audienceWord(p.audience), description: p.description, details: p.details.join("\n"), condition: p.condition, isNew: p.isNew, popular: String(p.popular),
    tags: p.tags.join(", "), videoUrl: p.videoUrl, material: p.material, careNotes: p.careNotes, deliveryNotes: p.deliveryNotes, seoTitle: p.seoTitle, seoDescription: p.seoDescription, family: p.family,
    releaseAt: toLocal(p.releaseAt), cap: p.capPerCustomer === null ? "" : String(p.capPerCustomer), status: p.status,
  });
  const [images, setImages] = useState(p.images);
  const [sale, setSale] = useState({ mode: "amount", value: p.sale.salePrice === null ? "" : String(p.sale.salePrice), starts: toLocal(p.sale.startsAt), ends: toLocal(p.sale.endsAt) });
  const [msg, setMsg] = useState<Msg>(null);
  const [saleMsg, setSaleMsg] = useState<Msg>(null);
  const [photoMsg, setPhotoMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  function save() {
    const values: ProductValues = {
      name: v.name, brand: v.brand, categoryId: v.categoryId, audience: v.audience, description: v.description, details: v.details.split("\n"), condition: v.condition, isNew: v.isNew, popular: Number(v.popular) || 0,
      tags: v.tags.split(","), images, videoUrl: v.videoUrl.trim(), material: v.material, careNotes: v.careNotes, deliveryNotes: v.deliveryNotes, seoTitle: v.seoTitle, seoDescription: v.seoDescription, family: v.family,
      releaseAt: toIso(v.releaseAt), capPerCustomer: v.cap === "" ? null : Number(v.cap), status: v.status,
    };
    start(async () => { const r = await saveProductAction(p.id, values); setMsg(r.ok ? { text: r.note ?? "Saved." } : { text: r.error ?? "Could not save.", bad: true }); });
  }

  /** Reads the picture's size first, so a small flyer crop is flagged before it reaches the shop. */
  async function upload(f: File) {
    let small = false;
    if (f.type.startsWith("image/")) {
      try { const b = await createImageBitmap(f); small = Math.max(b.width, b.height) < 1200; b.close(); } catch { /* the server still checks the type and size */ }
    }
    const fd = new FormData();
    fd.set("file", f); fd.set("alt", p.name); fd.set("folder", "products");
    start(async () => {
      const r = await mediaUploadAction(fd);
      if (!r.ok || !r.path) return setPhotoMsg({ text: r.error ?? "Upload failed.", bad: true });
      setImages((x) => [...x, r.path!]);
      setPhotoMsg(small ? { text: "Added, but it is under 1200 px on the long side, so it may look soft on large screens.", bad: true } : { text: "Added. Press Save to keep it." });
      if (file.current) file.current.value = "";
    });
  }
  const move = (i: number, d: number) => setImages((x) => { const n = [...x]; const [m] = n.splice(i, 1); n.splice(i + d, 0, m); return n; });

  function saveSale(end: boolean) {
    const n = Number(sale.value);
    if (!end && (sale.value === "" || !Number.isFinite(n))) return setSaleMsg({ text: "Enter the sale amount.", bad: true });
    start(async () => {
      const r = await setSaleAction(p.id, end ? null : { ...(sale.mode === "pct" ? { pct: n } : { amount: n }), startsAt: toIso(sale.starts), endsAt: toIso(sale.ends) });
      setSaleMsg(r.ok ? { text: r.note ?? "Saved." } : { text: r.error ?? "Could not save.", bad: true });
      if (r.ok && end) setSale({ mode: "amount", value: "", starts: "", ends: "" });
    });
  }

  return (
    <div className="max-w-3xl space-y-5">
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Photos</h2>
        <p className="text-sm text-text2">The first photo is the main one. Use 4:5 pictures at least 1200 px on the long side.</p>
        {images.length > 0 && (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {images.map((path, i) => (
              <li key={path} className="space-y-1 text-xs">
                <div className="relative aspect-[4/5] overflow-hidden rounded-[10px] bg-card"><Image src={publicFile("media", path) ?? path} alt={`${p.name}, photo ${i + 1}`} fill sizes="160px" className="object-cover" /></div>
                <div className="flex justify-between">
                  <span className="flex gap-2">
                    <button type="button" disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`} className="px-1 disabled:opacity-30" onClick={() => move(i, -1)}>‹</button>
                    <button type="button" disabled={i === images.length - 1} aria-label={`Move photo ${i + 1} later`} className="px-1 disabled:opacity-30" onClick={() => move(i, 1)}>›</button>
                  </span>
                  <button type="button" className="text-error underline" onClick={() => setImages((x) => x.filter((y) => y !== path))}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label="Add a photo" disabled={pending} className="field py-2" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        <Note m={photoMsg} />
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Details</h2>
        <Field label="Product name"><input className="field" value={v.name} onChange={set("name")} /></Field>
        <Field label="Brand"><input className="field" value={v.brand} onChange={set("brand")} /></Field>
        <Field label="Category"><select className="field" value={v.categoryId} onChange={set("categoryId")}>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <Field label="For"><select className="field" value={v.audience} onChange={set("audience")}>{audiences.map(([, l]) => <option key={l}>{l}</option>)}</select></Field>
        <Field label="Status" hint="Draft is hidden. Active is on the shop. Archived is kept for past orders."><select className="field" value={v.status} onChange={set("status")}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></Field>
        <Field label="Condition"><input className="field" value={v.condition} onChange={set("condition")} /></Field>
        <Field label="Description" wide><textarea className="field min-h-24 py-2" value={v.description} onChange={set("description")} /></Field>
        <Field label="Highlights" hint="One per line" wide><textarea className="field min-h-20 py-2" value={v.details} onChange={set("details")} /></Field>
        <Field label="Material"><input className="field" value={v.material} onChange={set("material")} /></Field>
        <Field label="Tags" hint="Comma separated, for filters and collections"><input className="field" value={v.tags} onChange={set("tags")} /></Field>
        <Field label="Care notes" wide><textarea className="field min-h-16 py-2" value={v.careNotes} onChange={set("careNotes")} /></Field>
        <Field label="Delivery notes" wide><textarea className="field min-h-16 py-2" value={v.deliveryNotes} onChange={set("deliveryNotes")} /></Field>
        <Field label="Video link" hint="Starts with https://"><input className="field" value={v.videoUrl} onChange={set("videoUrl")} /></Field>
        <Field label="Product family" hint="Links colourways of the same model"><input className="field" value={v.family} onChange={set("family")} /></Field>
        <Field label="Popularity rank" hint="Higher shows first under Popular"><input className="field" type="number" value={v.popular} onChange={set("popular")} /></Field>
        <label className="flex min-h-12 items-center gap-2 self-end text-sm"><input type="checkbox" checked={v.isNew} onChange={(e) => setV((x) => ({ ...x, isNew: e.target.checked }))} className="size-5 accent-[#00115b]" /> Show the NEW badge</label>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Drop</h2>
        <Field label="Release date and time" hint="Leave empty to sell now. Before this time the shop shows a countdown."><input className="field" type="datetime-local" value={v.releaseAt} onChange={set("releaseAt")} /></Field>
        <Field label="Limit per customer" hint="1 to 20. Leave empty for no limit."><input className="field" type="number" min={1} max={20} value={v.cap} onChange={set("cap")} /></Field>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Search listing</h2>
        <Field label={`Title (${v.seoTitle.length}/70)`} wide><input className="field" maxLength={70} value={v.seoTitle} onChange={set("seoTitle")} /></Field>
        <Field label={`Description (${v.seoDescription.length}/170)`} wide><textarea className="field min-h-16 py-2" maxLength={170} value={v.seoDescription} onChange={set("seoDescription")} /></Field>
      </section>

      <Note m={msg} />
      <div className="flex gap-2">
        <button type="button" disabled={pending} className="btn-primary" onClick={save}>{pending ? "Saving…" : "Save product"}</button>
        <Link href="/dashboard/catalogue" className="btn-outline">Back to catalogue</Link>
      </div>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-semibold">Sale</h2>
          <p className="text-sm text-text2">Applies to every size. Normal price {p.sale.minPrice === p.sale.maxPrice ? `GHS ${p.sale.minPrice}` : `GHS ${p.sale.minPrice} to ${p.sale.maxPrice}`}. Saved on its own.</p>
        </div>
        <Field label="Discount type"><select className="field" value={sale.mode} onChange={(e) => setSale((s) => ({ ...s, mode: e.target.value }))}><option value="amount">Sale price (GHS)</option><option value="pct">Percent off</option></select></Field>
        <Field label={sale.mode === "pct" ? "Percent off" : "Sale price (GHS)"}><input className="field" type="number" min={0} value={sale.value} onChange={(e) => setSale((s) => ({ ...s, value: e.target.value }))} /></Field>
        <Field label="Starts"><input className="field" type="datetime-local" value={sale.starts} onChange={(e) => setSale((s) => ({ ...s, starts: e.target.value }))} /></Field>
        <Field label="Ends"><input className="field" type="datetime-local" value={sale.ends} onChange={(e) => setSale((s) => ({ ...s, ends: e.target.value }))} /></Field>
        <div className="sm:col-span-2"><Note m={saleMsg} /></div>
        <div className="flex gap-2 sm:col-span-2">
          <button type="button" disabled={pending} className="btn-primary !min-h-10" onClick={() => saveSale(false)}>Save sale</button>
          {p.sale.salePrice !== null && <button type="button" disabled={pending} className="btn-outline !min-h-10" onClick={() => saveSale(true)}>End sale</button>}
        </div>
      </section>
    </div>
  );
}
