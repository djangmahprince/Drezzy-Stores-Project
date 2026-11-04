import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CustomerEditor } from "@/components/dashboard/CustomerEditor";
import { PageHead, Pill, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

type C360 = {
  id: string; name: string; phone: string | null; email: string | null; region: string | null; source: string | null; tags: string[]; notes: string | null; birthday: string | null;
  consent: { marketing: boolean; whatsapp: boolean; sms: boolean; at: string | null }; since: string; has_account: boolean; lifetime_value: number | null; orders_count: number;
  average_order: number | null; last_purchase: string | null; balance_due: number; merged: { id: string; name: string; phone: string }[];
  orders: { id: string; number: string; status: string; payment_state: string; total: number; balance: number; channel: string; at: string; region: string | null }[];
  profile: { shoe_size: string | null; clothing_size: string | null; style_tags: string[]; points: number } | null;
  addresses: { label: string; region: string; city: string; area: string | null; street: string; landmark: string | null; gps: string | null; default: boolean }[];
  wishlist: string[]; threads: { id: string; subject: string; status: string; at: string }[]; reviews: { rating: number; body: string; status: string; product: string | null }[];
};
const ghs = (n: number | null | undefined) => (n === null || n === undefined ? "Hidden" : `GHS ${Number(n).toLocaleString("en-GH")}`);
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Customer 360 (PRD section 17): contact, sizes, source, orders and balances, lifetime value, wishlist, notes, tags, consent, messages. */
async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, me] = await Promise.all([params, requireStaff()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data, error } = await (await createClient()).rpc("customer_360", { p_id: id });
  if (error || !data) return <p className="card p-8 text-center text-text2">This customer does not exist, or you do not have access to them.</p>;
  const c = data as C360;
  const full = can(me.permissions, "customers", "edit") && me.permissions.customers?.scope === "all";
  return (
    <>
      <PageHead real title={c.name} sub={`Customer since ${d(c.since)}${c.has_account ? " · has an account" : ""}${c.merged.length ? ` · ${c.merged.length} merged record(s)` : ""}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-1 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Contact</h2>
          <p>{c.phone}</p>{c.email && <p>{c.email}</p>}{c.region && <p>{c.region}</p>}
          {c.source && <p className="text-text2">Found us through: {c.source}</p>}
          {c.birthday && <p className="text-text2">Birthday: {d(c.birthday)}</p>}
          {c.merged.map((m) => <p key={m.id} className="text-text2">Also: {m.name} {m.phone}</p>)}
          <p className="pt-2">Consent: {c.consent.marketing ? <Pill tone="ok">Marketing</Pill> : <Pill>No marketing</Pill>} {c.consent.whatsapp && <Pill>WhatsApp</Pill>} {c.consent.sms && <Pill>SMS</Pill>}</p>
        </section>
        <section className="card grid grid-cols-2 gap-3 p-4 text-sm">
          <h2 className="col-span-2 font-semibold">Value</h2>
          <p><span className="block text-text2">Lifetime value</span><b className="text-lg">{ghs(c.lifetime_value)}</b></p>
          <p><span className="block text-text2">Orders</span><b className="text-lg">{c.orders_count}</b></p>
          <p><span className="block text-text2">Average order</span><b>{ghs(c.average_order)}</b></p>
          <p><span className="block text-text2">Last purchase</span><b>{d(c.last_purchase) || "None"}</b></p>
          {c.balance_due > 0 && <p className="col-span-2 font-medium text-warning">Balance to collect: {ghs(c.balance_due)}</p>}
        </section>
        <section className="card space-y-1 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Sizes and style</h2>
          {c.profile ? <><p>Shoe size: {c.profile.shoe_size ?? "Not set"} · Clothing: {c.profile.clothing_size ?? "Not set"}</p><p>Style: {c.profile.style_tags.join(", ") || "Not set"}</p><p>Points: {c.profile.points}</p></> : <p className="text-text2">No account, so no saved sizes.</p>}
          {c.wishlist.length > 0 && <p className="pt-2">Wishlist: {c.wishlist.join(", ")}</p>}
        </section>
      </div>
      <CustomerEditor id={c.id} tags={c.tags} notes={c.notes ?? ""} canEdit={can(me.permissions, "customers", "edit")} canErase={full && can(me.permissions, "customers", "delete")} />
      <h2 className="mb-2 mt-6 font-semibold">Orders</h2>
      <Table head={["Order", "Placed", "Channel", "Status", "Total", "Balance"]} rows={c.orders.map((o) => [
        <Link key={o.id} href={`/dashboard/orders/${o.number}`} className="font-semibold text-navy underline">{o.number}</Link>, d(o.at), o.channel, o.status.replace(/_/g, " "), ghs(o.total), o.balance > 0 ? ghs(o.balance) : "",
      ])} />
      {c.addresses.length > 0 && <><h2 className="mb-2 mt-6 font-semibold">Saved addresses</h2><Table head={["Label", "Address", "GPS"]} rows={c.addresses.map((a) => [a.label + (a.default ? " (default)" : ""), [a.street, a.landmark, a.area, a.city, a.region].filter(Boolean).join(", "), a.gps ?? ""])} /></>}
      {c.threads.length > 0 && <><h2 className="mb-2 mt-6 font-semibold">Messages</h2><Table head={["Subject", "Status", "Last message"]} rows={c.threads.map((t) => [<Link key={t.id} href={`/dashboard/support?thread=${t.id}`} className="text-navy underline">{t.subject}</Link>, t.status, d(t.at)])} /></>}
      {c.reviews.length > 0 && <><h2 className="mb-2 mt-6 font-semibold">Reviews</h2><Table head={["Product", "Rating", "Review", "Status"]} rows={c.reviews.map((r) => [r.product ?? "", "★".repeat(r.rating), r.body, r.status])} /></>}
    </>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Guard module="customers"><Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" />}><Profile params={params} /></Suspense></Guard>;
}
