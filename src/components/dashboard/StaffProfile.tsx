"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { commentWeekAction, updateStaffRecordAction } from "@/app/dashboard/staff/actions";

export function WeekComment({ staffId, week }: { staffId: string; week: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await commentWeekAction(staffId, week, body); if (r.ok) { setBody(""); router.refresh(); } }); }}>
      <input className="field" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment for this week" aria-label="Comment" />
      <button disabled={pending} className="btn-primary">Add</button>
    </form>
  );
}

export function StaffRecordForm({ id, startDate, status, team }: { id: string; startDate: string | null; status: string; team: string | null }) {
  const router = useRouter();
  const [f, setF] = useState({ start_date: startDate ?? "", employment_status: status, team: team ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card mt-4 grid gap-3 p-4 text-sm sm:grid-cols-4">
      <h2 className="font-semibold sm:col-span-4">Staff record</h2>
      <label><span className="mb-1 block font-medium">Start date</span><input type="date" className="field" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></label>
      <label><span className="mb-1 block font-medium">Status</span><select className="field" value={f.employment_status} onChange={(e) => setF({ ...f, employment_status: e.target.value })}><option value="active">Active</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option></select></label>
      <label><span className="mb-1 block font-medium">Team</span><input className="field" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} /></label>
      <button disabled={pending} className="btn-primary self-end" onClick={() => start(async () => { const r = await updateStaffRecordAction(id, f); setMsg(r.ok ? "Saved." : r.error); router.refresh(); })}>Save</button>
      {msg && <p role="status" className="text-text2 sm:col-span-4">{msg}</p>}
    </section>
  );
}
