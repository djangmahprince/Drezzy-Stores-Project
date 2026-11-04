"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { eraseCustomerAction, updateCustomerAction } from "@/app/dashboard/customers/actions";

/** Tags (VIP, wholesale, influencer) and notes on a customer, and erasing their personal data after a deletion request. */
export function CustomerEditor({ id, tags, notes, canEdit, canErase }: { id: string; tags: string[]; notes: string; canEdit: boolean; canErase: boolean }) {
  const router = useRouter();
  const [t, setT] = useState(tags.join(", "));
  const [n, setN] = useState(notes);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  if (!canEdit) return null;
  return (
    <section className="card mt-4 grid gap-3 p-4 text-sm sm:grid-cols-2">
      <label><span className="mb-1 block font-medium">Tags</span><input className="field" value={t} onChange={(e) => setT(e.target.value)} placeholder="VIP, wholesale, influencer" /></label>
      <label><span className="mb-1 block font-medium">Notes</span><input className="field" value={n} onChange={(e) => setN(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button disabled={pending} className="btn-primary !min-h-10" onClick={() => start(async () => { const r = await updateCustomerAction(id, { tags: t.split(",").map((x) => x.trim()).filter(Boolean), notes: n }); setMsg(r.ok ? { text: "Saved." } : { text: r.error, bad: true }); router.refresh(); })}>Save</button>
        {canErase && <button disabled={pending} className="btn-outline !min-h-10 !text-error" onClick={() => {
          if (!window.confirm("Erase this customer's personal data? Orders and money records are kept without their name, phone or address. This cannot be undone.")) return;
          start(async () => { const r = await eraseCustomerAction(id); setMsg(r.ok ? { text: "Personal data erased." } : { text: r.error, bad: true }); router.refresh(); });
        }}>Erase personal data</button>}
      </div>
      {msg && <p role={msg.bad ? "alert" : "status"} className={`rounded-[12px] px-3 py-2 sm:col-span-2 ${msg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
    </section>
  );
}
