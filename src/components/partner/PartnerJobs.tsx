"use client";

import { useState, useTransition } from "react";
import { partnerUpdateAction } from "@/app/partner/actions";

type Job = {
  id: string; number: string; status: string; receiver: string; phone: string; region: string | null; city: string | null; area: string | null; street: string | null;
  landmark: string | null; gps: string | null; note: string | null; balance: number | string; est: string | null;
};
export type PartnerData = {
  rider: { name: string; kind: string };
  jobs: Job[];
  week: { delivered: number; on_time: number; cash: number | string };
  targets: { metric: string; goal: number; from: string; to: string }[];
};

const statusWord: Record<string, string> = { packed: "Ready to collect", dispatched: "Dispatched", out_for_delivery: "On the way", failed_delivery: "Failed, try again", delivered: "Delivered" };

function JobCard({ j }: { j: Job }) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<"cash" | "momo">("cash");
  const [reference, setReference] = useState("");
  const [panel, setPanel] = useState<"" | "failed" | "collect">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const balance = Number(j.balance);
  const onWay = j.status === "dispatched" || j.status === "out_for_delivery";
  const run = (action: Parameters<typeof partnerUpdateAction>[1], d: Parameters<typeof partnerUpdateAction>[2] = {}) => start(async () => {
    const r = await partnerUpdateAction(j.id, action, d);
    setError(r.ok ? null : r.error);
    if (r.ok) setPanel("");
  });
  return (
    <li className="card space-y-3 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-bold text-navy">{j.number}</p><p className="text-text2">{statusWord[j.status] ?? j.status}{j.est ? ` · due ${j.est}` : ""}</p></div>
        {balance > 0 && <p className="rounded-[8px] bg-[#fbeedb] px-2 py-1 font-semibold text-warning">Collect GHS {balance}</p>}
      </div>
      <div>
        <p className="font-medium">{j.receiver}</p>
        <a href={`tel:${j.phone}`} className="text-navy underline">{j.phone}</a>
        <p className="mt-1 text-text2">{[j.street, j.area, j.city, j.region].filter(Boolean).join(", ")}</p>
        {j.landmark && <p className="text-text2">Near {j.landmark}</p>}
        {j.gps && <p className="text-text2">GPS {j.gps}</p>}
        {j.note && <p className="mt-1 rounded-[8px] bg-card p-2">{j.note}</p>}
      </div>
      {j.status !== "delivered" && (
        <div className="space-y-2">
          {!onWay && <button type="button" disabled={pending} className="btn-primary w-full" onClick={() => run("out_for_delivery")}>I am setting out</button>}
          {onWay && balance > 0 && <button type="button" disabled={pending} className="btn-primary w-full" onClick={() => setPanel(panel === "collect" ? "" : "collect")}>Collect GHS {balance}</button>}
          {panel === "collect" && (
            <div className="space-y-2 rounded-[10px] bg-card p-3">
              <select aria-label="How they paid" className="field" value={method} onChange={(e) => setMethod(e.target.value as "cash" | "momo")}><option value="cash">Cash</option><option value="momo">MoMo</option></select>
              {method === "momo" && <input className="field" aria-label="MoMo transaction ID" placeholder="MoMo transaction ID" value={reference} onChange={(e) => setReference(e.target.value)} />}
              <button type="button" disabled={pending} className="btn-primary w-full" onClick={() => run("collect", { method, reference })}>Record payment</button>
            </div>
          )}
          {onWay && balance <= 0 && (
            <div className="flex gap-2">
              <input className="field flex-1" inputMode="numeric" maxLength={4} aria-label="Customer's 4-digit delivery code" placeholder="Customer's 4-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <button type="button" disabled={pending || code.length !== 4} className="btn-primary disabled:opacity-50" onClick={() => run("delivered", { code })}>Delivered</button>
            </div>
          )}
          {onWay && <button type="button" className="text-sm text-error underline" onClick={() => setPanel(panel === "failed" ? "" : "failed")}>Could not deliver</button>}
          {panel === "failed" && (
            <div className="space-y-2 rounded-[10px] bg-card p-3">
              <input className="field" aria-label="What happened" placeholder="What happened?" value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="button" disabled={pending} className="btn-outline w-full" onClick={() => run("failed", { note })}>Report failed delivery</button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="rounded-[10px] bg-[#fbe4e4] px-3 py-2 text-error">{error}</p>}
    </li>
  );
}

export function PartnerJobs({ d }: { d: PartnerData }) {
  const open = d.jobs.filter((j) => j.status !== "delivered");
  const done = d.jobs.filter((j) => j.status === "delivered");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Hello, {d.rider.name}</h1>
        <p className="text-sm text-text2">{open.length} {open.length === 1 ? "job" : "jobs"} to do</p>
      </div>
      <ul className="grid grid-cols-3 gap-2 text-center text-sm">
        <li className="card p-3"><p className="text-xl font-bold">{d.week.delivered}</p><p className="text-text2">Delivered this week</p></li>
        <li className="card p-3"><p className="text-xl font-bold">{d.week.on_time}</p><p className="text-text2">On time</p></li>
        <li className="card p-3"><p className="text-xl font-bold">GHS {Number(d.week.cash)}</p><p className="text-text2">Collected</p></li>
      </ul>
      {open.length === 0 ? <p className="card p-6 text-center text-sm text-text2">No jobs right now.</p> : <ul className="space-y-3">{open.map((j) => <JobCard key={j.id} j={j} />)}</ul>}
      {done.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Delivered today</h2>
          <ul className="space-y-3">{done.map((j) => <JobCard key={j.id} j={j} />)}</ul>
        </section>
      )}
      {d.targets.length > 0 && (
        <section className="card p-4 text-sm">
          <h2 className="font-semibold">Your targets</h2>
          <ul className="mt-2 space-y-1">{d.targets.map((t, i) => <li key={i} className="flex justify-between"><span>{t.metric.replace(/_/g, " ")}</span><b>{t.goal}</b></li>)}</ul>
        </section>
      )}
    </div>
  );
}
