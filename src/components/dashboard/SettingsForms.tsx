"use client";

import { useState, useTransition } from "react";
import { siteSettingsAction } from "@/app/dashboard/content/actions";
import { createPartnerLoginAction, saveSettingAction, testSendAction } from "@/app/dashboard/settings/actions";

type Msg = { text: string; bad?: boolean } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role={m.bad ? "alert" : "status"} className={`rounded-[12px] px-3 py-2 text-sm ${m.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{m.text}</p> : null);
type J = Record<string, unknown>;

/** Site settings (FR-CMS-011): contact numbers for Accra and Kumasi, opening hours, social links, the delivery promise. */
export function SiteSettingsForm({ initial, canEdit }: { initial: J; canEdit: boolean }) {
  const [d, setD] = useState<J>(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const get = (path: string) => path.split(".").reduce<unknown>((o, k) => (o as J | undefined)?.[k], d) as string | undefined;
  const set = (path: string, v: string) => setD((x) => {
    const [a, b] = path.split(".");
    return b ? { ...x, [a]: { ...((x[a] as J) ?? {}), [b]: v } } : { ...x, [a]: v };
  });
  const field = (path: string, label: string) => (
    <label className="text-sm"><span className="mb-1 block font-medium">{label}</span><input className="field" disabled={!canEdit} value={get(path) ?? ""} onChange={(e) => set(path, e.target.value)} /></label>
  );
  return (
    <form className="card grid gap-3 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await siteSettingsAction(d); setMsg(r.ok ? { text: "Saved. The shop shows it now." } : { text: r.error ?? "Failed", bad: true }); }); }}>
      {field("accra.call", "Accra: call")}{field("accra.whatsapp", "Accra: WhatsApp")}
      {field("kumasi.call", "Kumasi: call")}{field("kumasi.whatsapp", "Kumasi: WhatsApp")}
      {field("logistics.accra", "Logistics line: Accra")}{field("logistics.kumasi", "Logistics line: Kumasi")}
      {field("logistics.hours", "Logistics line hours")}
      {field("hours", "Opening hours")}{field("promise", "Delivery promise (announcement bar fallback)")}
      {field("socials.instagram", "Instagram link")}{field("socials.tiktok", "TikTok link")}
      {field("socials.snapchat", "Snapchat link")}{field("socials.facebook", "Facebook link")}
      <div className="sm:col-span-2"><Note m={msg} /></div>
      {canEdit && <button disabled={pending} className="btn-primary sm:w-fit">Save</button>}
    </form>
  );
}

const ROLES: [string, string][] = [["owner", "Owner"], ["admin", "Admin"], ["sales_agent", "Sales"], ["sourcing_officer", "Sourcing"], ["dispatch_coordinator", "Dispatch"], ["content_editor", "Content"], ["customer_support", "Support"], ["finance", "Finance"]];
const ROUTES: [string, string][] = [
  ["new_order", "New paid order"], ["payment_failed", "Payment failed"], ["manual_payment", "Manual MoMo to check"], ["to_source", "Supplier order to place"],
  ["ready_to_pack", "Ready to pack"], ["support", "New customer message"], ["refund_requested", "Refund to decide"], ["stuck", "Stuck order"],
  ["supplier_late", "Supplier late"], ["stale_availability", "Availability not checked"], ["report_missing", "Daily reports missing"], ["budget", "Budget passed 80%"],
  ["pace", "Behind pace"], ["data_request", "Data request"], ["balances_today", "Balances on the road"], ["rider_cash", "Rider cash not handed in"],
];

/** The rules staff can change without a developer: alert limits, who gets which alert, delivery code, loyalty, leaderboard, reports, retention. */
export function RulesForm({ initial, canEdit, isOwner }: { initial: Record<string, J>; canEdit: boolean; isOwner: boolean }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const num = (key: string, k: string) => Number((s[key] ?? {})[k] ?? 0);
  const setK = (key: string, k: string, v: unknown) => setS((x) => ({ ...x, [key]: { ...(x[key] ?? {}), [k]: v } }));
  const save = (key: string) => start(async () => { const r = await saveSettingAction(key, s[key]); setMsg(r.ok ? { text: "Saved." } : { text: r.error, bad: true }); });
  const n = (key: string, k: string, label: string, hint?: string) => (
    <label className="text-sm"><span className="mb-1 block font-medium">{label}</span><input type="number" step="any" className="field" disabled={!canEdit} value={num(key, k)} onChange={(e) => setK(key, k, Number(e.target.value))} />{hint && <span className="mt-1 block text-xs text-text2">{hint}</span>}</label>
  );
  const routes = (s.alert_routes ?? {}) as Record<string, string[]>;
  const lb = ((s.leaderboard ?? {}) as { roles?: string[] }).roles ?? [];
  const rep = (s.reports ?? {}) as { daily_summary_to?: string[]; weekly_report_to?: string[] };
  return (
    <div className="space-y-5">
      <Note m={msg} />
      <section className="card grid gap-3 p-5 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">Stuck-order and team alerts (FR-ORD-007, FR-TG-007)</h2>
        {n("alerts", "confirm_hours", "Not confirmed after (hours)")}{n("alerts", "supplier_place_hours", "No supplier order after (hours)")}{n("alerts", "dispatch_hours", "Not dispatched after (hours)")}
        {n("alerts", "stale_days", "Availability not checked for (days)")}{n("alerts", "report_cutoff_hour", "Daily report cut-off (hour, 0 to 23)")}{n("alerts", "pace_threshold", "Pace alert below (0.7 = 70%)")}
        {n("alerts", "feedback_after_hours", "Ask for delivery feedback after (hours)")}{n("alerts", "abandoned_after_hours", "Bag reminder after (hours)")}
        {canEdit && <button disabled={pending} className="btn-primary sm:col-span-3 sm:w-fit" onClick={() => save("alerts")}>Save alert limits</button>}
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Who gets which alert</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr><th className="p-2 text-left">Alert</th>{ROLES.map(([, l]) => <th key={l} className="p-2">{l}</th>)}</tr></thead>
            <tbody>
              {ROUTES.map(([k, l]) => (
                <tr key={k} className="border-t border-line">
                  <td className="p-2">{l}</td>
                  {ROLES.map(([r]) => (
                    <td key={r} className="p-2 text-center"><input type="checkbox" disabled={!canEdit} aria-label={`${l}: ${r}`} className="accent-[#00115b]" checked={(routes[k] ?? []).includes(r)}
                      onChange={(e) => setS((x) => ({ ...x, alert_routes: { ...routes, [k]: e.target.checked ? [...(routes[k] ?? []), r] : (routes[k] ?? []).filter((y) => y !== r) } }))} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canEdit && <button disabled={pending} className="btn-primary" onClick={() => save("alert_routes")}>Save alert routes</button>}
      </section>
      <section className="card grid gap-3 p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Delivery and rewards</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEdit} className="size-5 accent-[#00115b]" checked={!!(s.delivery ?? {}).require_delivery_code} onChange={(e) => setK("delivery", "require_delivery_code", e.target.checked)} /> Require the customer&apos;s delivery code or a photo to mark an order delivered</label>
        {canEdit && <button disabled={pending} className="btn-outline sm:w-fit" onClick={() => save("delivery")}>Save</button>}
        {n("loyalty", "ghs_per_point", "GHS spent per reward point", "1 point per GHS 10 by default")}
        {canEdit && <button disabled={pending} className="btn-outline self-end sm:w-fit" onClick={() => save("loyalty")}>Save</button>}
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Leaderboard (FR-TG-008)</h2>
        <p className="text-sm text-text2">Off by default: a ranking can push people to grab easy orders or stop helping each other. Only the Owner switches it on, per team.</p>
        <div className="flex flex-wrap gap-3">{ROLES.filter(([r]) => !["owner", "admin"].includes(r)).map(([r, l]) => (
          <label key={r} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!isOwner} className="size-5 accent-[#00115b]" checked={lb.includes(r)} onChange={(e) => setS((x) => ({ ...x, leaderboard: { roles: e.target.checked ? [...lb, r] : lb.filter((y) => y !== r) } }))} /> {l}</label>
        ))}</div>
        {isOwner && <button disabled={pending} className="btn-outline" onClick={() => save("leaderboard")}>Save</button>}
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Report emails (FR-AN-010)</h2>
        <p className="text-sm text-text2">The daily sales and cash summary goes out after 8pm; the weekly report on Monday morning.</p>
        {(["daily_summary_to", "weekly_report_to"] as const).map((k) => (
          <div key={k} className="flex flex-wrap items-center gap-3 text-sm"><span className="w-40 font-medium">{k === "daily_summary_to" ? "Daily summary to" : "Weekly report to"}</span>
            {ROLES.map(([r, l]) => <label key={r} className="flex items-center gap-1"><input type="checkbox" disabled={!canEdit} className="accent-[#00115b]" checked={(rep[k] ?? []).includes(r)} onChange={(e) => setS((x) => ({ ...x, reports: { ...rep, [k]: e.target.checked ? [...(rep[k] ?? []), r] : (rep[k] ?? []).filter((y) => y !== r) } }))} /> {l}</label>)}
          </div>
        ))}
        {canEdit && <button disabled={pending} className="btn-outline" onClick={() => save("reports")}>Save</button>}
      </section>
      <section className="card grid gap-3 p-5 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">Keeping data (FR-DATA-010). Confirm these with legal advice.</h2>
        {n("retention", "inactive_review_years", "Review inactive accounts after (years)")}{n("retention", "events_aggregate_months", "Keep detailed visit events for (months)", "Older ones are kept as daily counts")}{n("retention", "logs_months", "Keep message and alert logs for (months)")}
        {canEdit && <button disabled={pending} className="btn-outline sm:col-span-3 sm:w-fit" onClick={() => save("retention")}>Save</button>}
      </section>
    </div>
  );
}

export function PartnerLogin({ riders }: { riders: { id: string; name: string; hasLogin: boolean }[] }) {
  const [rider, setRider] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const free = riders.filter((r) => !r.hasLogin);
  return (
    <form className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createPartnerLoginAction(rider, email); setMsg(r.ok ? { text: `Login created. Share this temporary password privately: ${r.password}. They sign in at /partner.` } : { text: r.error, bad: true }); }); }}>
      <h3 className="font-semibold sm:col-span-3">Partner portal login (riders and courier agents see only their jobs)</h3>
      <select className="field" value={rider} onChange={(e) => setRider(e.target.value)} aria-label="Rider" required><option value="">Choose a rider</option>{free.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" aria-label="Email" required />
      <button disabled={pending} className="btn-primary">Create login</button>
      <div className="sm:col-span-3"><Note m={msg} /></div>
    </form>
  );
}

export function TestSend({ templates }: { templates: { key: string; subject: string; body: string }[] }) {
  const [key, setKey] = useState(templates[0]?.key ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card flex flex-wrap items-center gap-2 p-4 text-sm">
      <span className="font-semibold">Test-send to yourself:</span>
      <select className="field max-w-xs" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Template">{templates.map((t) => <option key={t.key}>{t.key}</option>)}</select>
      <button disabled={pending} className="btn-primary !min-h-10" onClick={() => start(async () => { const t = templates.find((x) => x.key === key)!; const r = await testSendAction(t.key, t.subject, t.body); setMsg(r.ok ? { text: "Sent. Check your inbox." } : { text: r.error, bad: true }); })}>Send test</button>
      <Note m={msg} />
    </div>
  );
}
