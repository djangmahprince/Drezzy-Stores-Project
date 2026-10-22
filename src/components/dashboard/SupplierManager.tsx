"use client";

import { useActionState, useState } from "react";
import { saveSupplier, type SupplierState } from "@/app/dashboard/catalogue/suppliers/actions";
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
      <input name="notes" defaultValue={s?.notes} placeholder="Notes (what they supply, payment terms)" aria-label="Notes" className={inputCls} disabled={!canEdit} />
      {fresh ? <span /> : (
        <select name="active" defaultValue={String(s.active)} aria-label="Status" className={inputCls} disabled={!canEdit}>
          <option value="true">Active</option><option value="false">Not in use</option>
        </select>
      )}
      <div className="flex items-center gap-2">
        <button disabled={!canEdit || pending} className="btn-outline !min-h-10 disabled:opacity-50">{pending ? "Saving…" : fresh ? "Add" : "Save"}</button>
        {state.ok && <Pill tone="ok">Saved</Pill>}
      </div>
      {state.error && <p role="alert" className="text-xs font-medium text-error md:col-span-6">{state.error}</p>}
    </form>
  );
}

export function SupplierManager({ suppliers, canEdit }: { suppliers: SupplierRow[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      {canEdit && <button type="button" className="btn-primary mb-3 !min-h-10" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>{adding ? "Close" : "Add supplier"}</button>}
      <div className="card">
        {adding && <div className="bg-card"><Row canEdit={canEdit} key="new" /></div>}
        {suppliers.length === 0 && !adding && <p className="p-8 text-center text-sm text-text2">No suppliers yet. Add the trusted suppliers and wholesalers you order from.</p>}
        {suppliers.map((s) => <Row key={s.id} s={s} canEdit={canEdit} />)}
      </div>
      <p className="mt-3 text-sm text-text2">A supplier you stop using can be marked Not in use. It stays on past orders but no longer shows when choosing a supplier.</p>
    </>
  );
}
