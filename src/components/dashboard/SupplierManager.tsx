"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { saveSupplier, type SupplierState } from "@/app/dashboard/catalogue/suppliers/actions";
import { confirmSupplierAction, importPriceList, type PriceListResult } from "@/app/dashboard/catalogue/tools-actions";
import { Pill } from "@/components/dashboard/DashShell";
import type { SupplierRow } from "@/lib/catalogue/staff-types";

const inputCls = "min-h-10 w-full rounded-[10px] border border-line bg-white px-2 text-sm disabled:bg-card";

function Row({ s, canEdit }: { s?: SupplierRow; canEdit: boolean }) {
  const [state, action, pending] = useActionState<SupplierState, FormData>(saveSupplier, {});
  const fresh = !s;
  return (
    <form action={action} className="grid items-start gap-2 border-b border-line p-3 last:border-0 md:grid-cols-[1.2fr_1fr_1fr_1.4fr_auto_auto]">
      {s && <input type="hidden" name="id" value={s.id} />}
      <input name="name" defaultValue={s?.name} placeholder="Supplier name" aria-label="Supplier name" className={inputCls} disabled={!canEdit} required />
      <input name="phone" defaultValue={s?.phone} placeholder="Phone" aria-label="Phone" className={inputCls} disabled={!canEdit} />
      <input name="whatsapp" defaultValue={s?.whatsapp} placeholder="WhatsApp" aria-label="WhatsApp" className={inputCls} disabled={!canEdit} />
      <input name="notes" defaultValue={s?.notes} placeholder="Notes (payment terms)" aria-label="Notes" className={inputCls} disabled={!canEdit} />
      {fresh ? <span /> : (
        <select name="active" defaultValue={String(s.active)} aria-label="Status" className={inputCls} disabled={!canEdit}>
          <option value="true">Active</option><option value="false">Not in use</option>
        </select>
      )}
      <div className="flex items-center gap-2">
        <button disabled={!canEdit || pending} className="btn-outline !min-h-10 disabled:opacity-50">{pending ? "Saving…" : fresh ? "Add" : "Save"}</button>
        {state.ok && <Pill tone="ok">Saved</Pill>}
      </div>
      <input name="contactPerson" defaultValue={s?.contactPerson} placeholder="Contact person" aria-label="Contact person" className={inputCls} disabled={!canEdit} />
      <input name="location" defaultValue={s?.location} placeholder="Location" aria-label="Location" className={inputCls} disabled={!canEdit} />
      <input name="supplies" defaultValue={s?.supplies} placeholder="Products supplied" aria-label="Products supplied" className={`${inputCls} md:col-span-2`} disabled={!canEdit} />
      <label className="flex min-h-10 items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="trusted" defaultChecked={s?.trusted} disabled={!canEdit} className="size-5 accent-[#00115b]" /> Trusted supplier</label>
      {state.error && <p role="alert" className="text-xs font-medium text-error md:col-span-6">{state.error}</p>}
      {s && canEdit && <SupplierTools s={s} />}
    </form>
  );
}

/** The call-and-confirm button and the price list upload for one supplier. */
function SupplierTools({ s }: { s: SupplierRow }) {
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [preview, setPreview] = useState<PriceListResult | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const send = (mode: "preview" | "commit") => {
    const f = file.current?.files?.[0];
    if (!f) return setMsg({ text: "Choose a price list file first.", bad: true });
    const fd = new FormData();
    fd.set("file", f); fd.set("supplierId", s.id); fd.set("mode", mode);
    start(async () => {
      const r = await importPriceList(fd);
      setPreview(mode === "preview" && r.ok ? r : null);
      setMsg(r.ok ? (mode === "commit" ? { text: `${r.matched} prices saved.` } : null) : { text: r.error ?? "Failed", bad: true });
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm md:col-span-6">
      <button type="button" disabled={pending} className="btn-outline !min-h-9 !px-3 text-sm" onClick={() => start(async () => { const r = await confirmSupplierAction(s.id); setMsg({ text: r.note ?? r.error ?? "", bad: !r.ok }); })}>Confirm everything after a call</button>
      <input ref={file} type="file" accept=".csv,.xlsx" aria-label={`Price list for ${s.name}`} className="max-w-56 text-xs" onChange={() => setPreview(null)} />
      <button type="button" disabled={pending} className="btn-outline !min-h-9 !px-3 text-sm" onClick={() => send("preview")}>Check price list</button>
      {preview && (
        <>
          <span className="text-text2">{preview.matched} matched: {preview.news} new, {preview.rises} up, {preview.falls} down{preview.unknown.length ? `. Unknown SKUs: ${preview.unknown.slice(0, 5).join(", ")}` : ""}{preview.bad.length ? `. Bad rows: ${preview.bad.slice(0, 5).join(", ")}` : ""}</span>
          <button type="button" disabled={pending || preview.matched === 0 || preview.bad.length > 0} className="btn-primary !min-h-9 !px-3 text-sm disabled:opacity-50" onClick={() => send("commit")}>Save prices</button>
        </>
      )}
      {msg && <span role={msg.bad ? "alert" : "status"} className={msg.bad ? "text-error" : "text-success"}>{msg.text}</span>}
    </div>
  );
}

export function SupplierManager({ suppliers, canEdit }: { suppliers: SupplierRow[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = suppliers.filter((s) => !term || `${s.name} ${s.contactPerson ?? ""} ${s.location ?? ""} ${s.supplies ?? ""} ${s.phone ?? ""}`.toLowerCase().includes(term));
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {canEdit && <button type="button" className="btn-primary !min-h-10" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>{adding ? "Close" : "Add supplier"}</button>}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a supplier" aria-label="Find a supplier" className="field !min-h-10 max-w-xs flex-1" />
      </div>
      <div className="card">
        {adding && <div className="bg-card"><Row canEdit={canEdit} key="new" /></div>}
        {suppliers.length === 0 && !adding && <p className="p-8 text-center text-sm text-text2">No suppliers yet. Add the trusted suppliers and wholesalers you order from.</p>}
        {shown.map((s) => <Row key={s.id} s={s} canEdit={canEdit} />)}
      </div>
      <p className="mt-3 text-sm text-text2">A supplier you stop using can be marked Not in use. It stays on past orders but no longer shows when choosing a supplier. A price list needs SKU and Cost columns; Lead time and Available are optional.</p>
    </>
  );
}
