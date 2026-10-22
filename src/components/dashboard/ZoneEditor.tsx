"use client";

import { useState, useTransition } from "react";
import { saveZoneAction, type ZoneInput } from "@/app/dashboard/settings/actions";

type Row = ZoneInput;

export function ZoneEditor({ initial, canEdit }: { initial: Row[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  const change = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const dirty = (i: number) => JSON.stringify(rows[i]) !== JSON.stringify(saved[i]);

  function save(i: number) {
    start(async () => {
      const res = await saveZoneAction(rows[i]);
      setMsg(res.ok ? { text: `${rows[i].region} saved. The shop now uses it.`, bad: false } : { text: res.error, bad: true });
      if (res.ok) setSaved((s) => s.map((x, j) => (j === i ? rows[i] : x)));
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text2">What the shop charges and promises for each region. Half payment is only allowed where you switch it on (the PRD says Accra only). Changes apply to new orders straight away.</p>
      {msg && <p role="status" className={`rounded-[12px] p-3 text-sm ${msg.bad ? "bg-[#fdecec] text-error" : "bg-[#e3f5ee] text-success"}`}>{msg.text}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-text2"><tr><th className="p-3">Region</th><th className="p-3">Fee (GHS)</th><th className="p-3">Days</th><th className="p-3">Half payment</th><th className="p-3">On sale</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((z, i) => (
              <tr key={z.region} className={z.active ? "" : "opacity-60"}>
                <td className="p-3 font-medium">{z.region}</td>
                <td className="p-3"><input aria-label={`${z.region} fee`} type="number" min={0} step="1" disabled={!canEdit} className="field !min-h-10 w-24" value={Number.isNaN(z.fee) ? "" : z.fee} onChange={(e) => change(i, { fee: e.target.value === "" ? NaN : Number(e.target.value) })} /></td>
                <td className="p-3"><input aria-label={`${z.region} days`} type="number" min={0} max={30} disabled={!canEdit} className="field !min-h-10 w-20" value={Number.isNaN(z.days) ? "" : z.days} onChange={(e) => change(i, { days: e.target.value === "" ? NaN : Number(e.target.value) })} /></td>
                <td className="p-3"><input aria-label={`${z.region} half payment`} type="checkbox" disabled={!canEdit} className="size-5 accent-[#00115b]" checked={z.half} onChange={(e) => change(i, { half: e.target.checked })} /></td>
                <td className="p-3"><input aria-label={`${z.region} on sale`} type="checkbox" disabled={!canEdit} className="size-5 accent-[#00115b]" checked={z.active} onChange={(e) => change(i, { active: e.target.checked })} /></td>
                <td className="p-3 text-right">{canEdit && <button type="button" disabled={pending || !dirty(i)} className="btn-primary !min-h-9 text-xs disabled:opacity-40" onClick={() => save(i)}>Save</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
