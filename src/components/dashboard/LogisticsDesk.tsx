"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deliveryUpdateAction } from "@/app/dashboard/orders/actions";
import { Avatar, Kpi, Pill } from "@/components/dashboard/DashShell";
import { formatGHS } from "@/lib/data";
import type { LogisticsData, LogisticsJob } from "@/lib/logistics/staff";

const statusWord: Record<string, [string, "info" | "ok" | "warn" | "bad"]> = {
  packed: ["Waiting to leave", "info"], dispatched: ["Dispatched", "info"], out_for_delivery: ["Out for delivery", "ok"], failed_delivery: ["Failed, try again", "bad"],
};
const presets = ["Rider has picked up your order", "On the way to you", "Delayed by traffic, we will call you", "Rider could not reach you, please call us"];
const stamp = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" }).format(new Date(iso));

function Job({ j, demo }: { j: LogisticsJob; demo: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [word, tone] = statusWord[j.status] ?? [j.status, "info"];
  const onRoad = j.status !== "packed";
  const post = () => start(async () => {
    if (demo) return setMsg({ text: "Connect Supabase to post updates.", bad: true });
    const r = await deliveryUpdateAction(j.id, text);
    setMsg(r.ok ? { text: "The customer can see this now." } : { text: r.error, bad: true });
    if (r.ok) { setText(""); router.refresh(); }
  });
  return (
    <li className="p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p><Link href={`/dashboard/orders/${j.number}`} className="font-bold text-navy underline">{j.number}</Link> · {j.place}</p>
        <span className="flex items-center gap-2">{j.balance > 0 && <Pill tone="warn">Collect {formatGHS(j.balance)}</Pill>}<Pill tone={tone}>{word}</Pill></span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <p><span className="text-text2">Customer:</span> {j.customer}{j.customerPhone && <> · <a href={`tel:${j.customerPhone}`} className="text-navy underline">{j.customerPhone}</a></>}</p>
        <p><span className="text-text2">With:</span> {j.rider ?? j.courier ?? <Link href="/dashboard/dispatch" className="font-semibold text-error underline">Nobody yet. Assign a rider</Link>}{j.riderPhone && <> · <a href={`tel:${j.riderPhone}`} className="text-navy underline">{j.riderPhone}</a></>}{j.tracking ? ` · tracking ${j.tracking}` : ""}</p>
      </div>
      {j.update && <p className="mt-2 rounded-[10px] bg-card px-3 py-2">{j.update}{j.updateAt ? <span className="text-text2"> · {stamp(j.updateAt)}</span> : null}</p>}
      {onRoad && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input list="logistics-presets" className="field !min-h-10 flex-1 !text-sm" maxLength={200} aria-label={`Update for the customer on ${j.number}`} placeholder="Update for the customer" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" disabled={pending || !text.trim()} className="btn-outline !min-h-10 disabled:opacity-50" onClick={post}>Post update</button>
        </div>
      )}
      {msg && <p role={msg.bad ? "alert" : "status"} className={`mt-1 text-xs ${msg.bad ? "text-error" : "text-success"}`}>{msg.text}</p>}
    </li>
  );
}

/** The logistics department (meeting of 4 November): with no GPS, people and phone numbers keep customers informed. */
export function LogisticsDesk({ d, demo = false }: { d: LogisticsData; demo?: boolean }) {
  const road = d.jobs.filter((j) => j.status === "dispatched" || j.status === "out_for_delivery");
  const unassigned = d.jobs.filter((j) => j.status === "packed" && !j.rider && !j.courier);
  const failed = d.jobs.filter((j) => j.status === "failed_delivery");
  const cash = road.reduce((s, j) => s + j.balance, 0);
  return (
    <div className="space-y-4">
      <datalist id="logistics-presets">{presets.map((p) => <option key={p} value={p} />)}</datalist>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="On the road" value={String(road.length)} note={`${d.deliveredToday} delivered today`} />
        <Kpi label="Need a rider" value={String(unassigned.length)} note="Packed with nobody assigned" noteTone={unassigned.length ? "warn" : undefined} />
        <Kpi label="Failed deliveries" value={String(failed.length)} note="Call the customer and reschedule" noteTone={failed.length ? "bad" : undefined} />
        <Kpi label="Cash to collect" value={formatGHS(cash)} note="On orders on the road" />
        <Kpi label="Riders and couriers" value={String(d.riders.length)} note={`${d.riders.filter((r) => r.active > 0).length} on a job now`} />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="card min-w-0">
          <h2 className="px-4 pt-4 font-semibold">Deliveries in progress</h2>
          {d.jobs.length === 0 ? <p className="p-6 text-center text-sm text-text2">Nothing is waiting to leave or on the road.</p> : <ul className="divide-y divide-line">{d.jobs.map((j) => <Job key={j.id} j={j} demo={demo} />)}</ul>}
        </section>
        <div className="space-y-4">
          <section className="card p-4 text-sm">
            <div className="flex items-baseline justify-between"><h2 className="text-base font-semibold">Logistics line</h2><Link href="/dashboard/settings/site" className="font-semibold text-navy underline">Change</Link></div>
            <p className="mt-2">Accra: <b>{d.line.accra || "Not set"}</b></p>
            <p>Kumasi: <b>{d.line.kumasi || "Not set"}</b></p>
            {d.line.hours && <p className="text-text2">{d.line.hours}</p>}
            <p className="mt-2 text-xs text-text2">Customers see this on the tracker when an order is on the road. A rider&apos;s own number shows only during their delivery.</p>
          </section>
          <section className="card p-4 text-sm">
            <div className="flex items-baseline justify-between"><h2 className="text-base font-semibold">Riders and couriers</h2><Link href="/dashboard/settings/riders" className="font-semibold text-navy underline">Manage</Link></div>
            {d.riders.length === 0 ? <p className="mt-2 text-text2">No riders yet. Add them under Manage.</p> : (
              <ul className="mt-3 space-y-3">
                {d.riders.map((r) => (
                  <li key={r.id} className="flex items-center gap-3">
                    <Avatar name={r.name} />
                    <span className="min-w-0 flex-1 leading-tight"><b>{r.name}</b>{r.company ? ` · ${r.company}` : ""}<span className="block text-xs text-text2">{r.region ?? "Any region"} · {r.deliveredWeek} delivered this week{r.hasLogin ? "" : " · no login"}</span></span>
                    <span className="text-right text-xs">{r.phone ? <a href={`tel:${r.phone}`} className="text-navy underline">{r.phone}</a> : <span className="text-error">No number</span>}<span className="block text-text2">{r.active} active</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
