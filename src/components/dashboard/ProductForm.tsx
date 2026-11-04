"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createProduct, type CreateState } from "@/app/dashboard/catalogue/actions";

const L = ({ id, children }: { id: string; children: React.ReactNode }) => <label htmlFor={id} className="mb-1 block text-sm font-medium">{children}</label>;

const count = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).length;

export function ProductForm({ categories }: { categories: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createProduct, {});
  const [styles, setStyles] = useState("");
  const [colours, setColours] = useState("");
  const [sizes, setSizes] = useState("");
  const variants = Math.max(1, count(styles)) * count(colours) * count(sizes);

  if (state.ok) {
    return (
      <div className="card mx-auto max-w-lg space-y-3 p-8 text-center">
        <p className="text-sm text-text2">Product added as a draft</p>
        <p className="text-lg font-semibold">{state.ok.variants} variants created, all Unavailable</p>
        <p className="text-sm text-text2">Nothing is offered for sale until a sourcing officer confirms a supplier can provide each size. Open the catalogue to set availability, then publish.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/dashboard/catalogue/${state.ok.id}`} className="btn-primary">Add photos and details</Link>
          <Link href="/dashboard/catalogue" className="btn-outline">Open the catalogue</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="card max-w-3xl space-y-5 p-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><L id="p-name">Product name</L><input id="p-name" name="name" className="field" required /></div>
        <div><L id="p-brand">Brand</L><input id="p-brand" name="brand" className="field" required /></div>
        <div><L id="p-cat">Category</L>
          <select id="p-cat" name="categoryId" className="field" defaultValue=""><option value="" disabled>Choose</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
        <div><L id="p-aud">For</L>
          <select id="p-aud" name="audience" className="field" defaultValue="unisex"><option value="men">Men</option><option value="ladies">Ladies</option><option value="men_and_ladies">Men and ladies</option><option value="unisex">Unisex</option></select></div>
        <div><L id="p-price">Price (GHS)</L><input id="p-price" name="price" type="number" min={0} step="1" className="field" required /></div>
        <div><L id="p-lead">Supplier lead time (days)</L><input id="p-lead" name="leadDays" type="number" min={0} max={60} defaultValue={2} className="field" /></div>
      </div>

      <fieldset className="space-y-3 rounded-[12px] bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Variants</legend>
        <p className="text-sm text-text2">Separate values with commas. Every style, colour and size combination becomes its own variant. Use <b>One size</b> for watches and caps. Leave style empty if the product has none.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><L id="p-styles">Styles (optional)</L><input id="p-styles" name="styles" value={styles} onChange={(e) => setStyles(e.target.value)} placeholder="Low, Mid, High" className="field" /></div>
          <div><L id="p-colours">Colours</L><input id="p-colours" name="colours" value={colours} onChange={(e) => setColours(e.target.value)} placeholder="Black / White, Purple" className="field" /></div>
          <div><L id="p-sizes">Sizes</L><input id="p-sizes" name="sizes" value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="39, 40, 41, 42" className="field" /></div>
        </div>
        <p className="text-sm font-medium" aria-live="polite">{variants > 0 ? `This creates ${variants} ${variants === 1 ? "variant" : "variants"}.` : "Add colours and sizes to see how many variants this creates."}</p>
      </fieldset>

      <div><L id="p-desc">Description</L><textarea id="p-desc" name="description" className="field min-h-24 py-2" placeholder="Material, fit, how it runs on size, and what comes in the box." /></div>
      <div><L id="p-details">Highlights (one per line)</L><textarea id="p-details" name="details" className="field min-h-20 py-2" placeholder={"Brand new, original\nRuns true to size"} /></div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="isNew" className="size-5 accent-[#00115b]" /> Show the NEW badge</label>

      {state.error && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-3 py-2 text-sm font-medium text-error">{state.error}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className="btn-primary disabled:opacity-60">{pending ? "Adding…" : "Add product"}</button>
        <Link href="/dashboard/catalogue" className="btn-outline">Cancel</Link>
      </div>
    </form>
  );
}
