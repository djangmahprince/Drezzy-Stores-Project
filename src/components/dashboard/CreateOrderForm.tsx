"use client";

import Link from "next/link";
import { useState } from "react";
import { Pill } from "@/components/dashboard/DashShell";
import { createStaffOrderAction } from "@/app/dashboard/orders/actions";
import { createDashOrder } from "@/lib/dash";
import { findVariant, variantsFor } from "@/lib/catalogue/build";
import type { Product } from "@/lib/catalogue/types";
import { formatGHS, sources, type Zone } from "@/lib/data";
import { searchProducts } from "@/lib/search";

type Line = { product: Product; style?: string; colour: string; size: string; qty: number };

/** The variant a line points at, so price, availability and lead time come from the exact style, colour and size. */
const variantOf = (l: Line) => findVariant(l.product, { style: l.style, colour: l.colour, size: l.size });
const L = ({ id, children }: { id: string; children: React.ReactNode }) => <label htmlFor={id} className="mb-1 block text-sm font-medium">{children}</label>;

const channels = ["WhatsApp", "Phone", "Instagram DM", "Walk-in"] as const;
const channelDb = { WhatsApp: "whatsapp", Phone: "phone", "Instagram DM": "instagram_dm", "Walk-in": "walk_in" } as const;

type Created = { id: string; items: string };

/** `live` is true when the database is connected: orders are then created for real and priced by the database. */
export function CreateOrderForm({ products, zones, live = false }: { products: Product[]; zones: Zone[]; live?: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("Greater Accra");
  const [place, setPlace] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [pickup, setPickup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [channel, setChannel] = useState<(typeof channels)[number]>("WhatsApp");
  const [plan, setPlan] = useState<"full" | "half">("full");
  const [discount, setDiscount] = useState(0);
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("");
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const zone = zones.find((z) => z.region === region);
  const results = q.trim() ? searchProducts(products, q).slice(0, 5) : [];
  const subtotal = lines.reduce((s, l) => s + (variantOf(l)?.price ?? l.product.price) * l.qty, 0);
  const fee = lines.length && !pickup ? (zone?.fee ?? 0) : 0;
  const total = Math.max(0, subtotal + fee - discount);
  const canSplit = pickup || !!zone?.accra;
  const effPlan = canSplit ? plan : "full";
  const due = effPlan === "half" ? Math.ceil(total / 2) : total;
  const lead = Math.max(0, ...lines.map((l) => variantOf(l)?.leadDays ?? l.product.leadDays)) + (zone?.days ?? 0);

  const errors: string[] = [];
  if (name.trim().length < 2) errors.push("Add the customer's name.");
  if (!/^(\+233|233|0)\d{9}$/.test(phone.replace(/[\s-]/g, ""))) errors.push("Add a valid Ghana phone number.");
  if (lines.length === 0) errors.push("Add at least one item.");
  if (lines.some((l) => !l.size)) errors.push("Choose a size for every item.");
  if (lines.some((l) => l.size && variantOf(l)?.availability === "Unavailable")) errors.push("An item you chose is unavailable. Pick another size or colour.");
  if (discount > 0 && !reason.trim()) errors.push("A discount needs a reason.");
  if (live && !pickup && (city.trim().length < 2 || street.trim().length < 3)) errors.push("Add the city and a street or landmark for delivery.");

  const itemsText = () =>
    lines.map((l) => `${l.product.name}${l.style ? ` ${l.style}` : ""}${l.product.colours.length > 1 ? ` · ${l.colour}` : ""}${l.size !== "One size" ? ` · ${l.size}` : ""}${l.qty > 1 ? ` ×${l.qty}` : ""}`).join(", ");

  async function createLive(copy: boolean) {
    setBusy(true);
    setServerError(null);
    const res = await createStaffOrderAction({
      channel: channelDb[channel],
      customer: { name, phone, email: "" },
      delivery: { method: pickup ? "pickup" : "home", region: pickup ? "Greater Accra" : region, city, area: place, street },
      plan: effPlan,
      source,
      discount: { amount: discount, reason },
      items: lines.map((l) => ({ variantId: variantOf(l)?.id ?? "", qty: l.qty })),
    });
    setBusy(false);
    if (!res.ok) return setServerError(res.error);
    if (copy) {
      const text = `Hi ${name.trim().split(" ")[0]}, thank you for ordering from Drezzy Stores.\nOrder ${res.number}: ${itemsText()}\nTotal ${formatGHS(res.total)}${effPlan === "half" ? ` (pay ${formatGHS(res.dueNow)} now, ${formatGHS(res.total - res.dueNow)} on delivery)` : ""}.\nDelivery to ${pickup ? "pickup at our Accra branch" : region}, about ${lead} days.`;
      navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => undefined);
    }
    setDone({ id: res.number, items: itemsText() });
  }

  function create(copy: boolean) {
    setTried(true);
    if (errors.length) return;
    if (live) {
      void createLive(copy);
      return;
    }
    const o = createDashOrder({
      customer: name.trim().split(" ")[0],
      place: place.trim() || region,
      branch: region === "Ashanti" ? "Kumasi" : "Accra",
      items: lines.map((l) => `${l.product.name}${l.style ? ` ${l.style}` : ""}${l.product.colours.length > 1 ? ` · ${l.colour}` : ""}${l.size !== "One size" ? ` · ${l.size}` : ""}${l.qty > 1 ? ` ×${l.qty}` : ""}`).join(", "),
      channel,
      total,
      balance: total - due,
      pay: "pending",
      payNote: effPlan === "half" ? `Awaiting half payment · ${formatGHS(due)}` : `Awaiting payment · ${formatGHS(due)}`,
    });
    if (copy) {
      const text = `Hi ${name.trim().split(" ")[0]}, thank you for ordering from Drezzy Stores.\nOrder ${o.id}: ${o.items}\nTotal ${formatGHS(total)}${effPlan === "half" ? ` (pay ${formatGHS(due)} now, ${formatGHS(total - due)} on delivery)` : ""}.\nDelivery to ${region}, about ${lead} days.`;
      navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => undefined);
    }
    setDone({ id: o.id, items: o.items });
  }

  if (done) {
    return (
      <div className="card mx-auto max-w-lg space-y-3 p-8 text-center">
        <p className="text-sm text-text2">Order created</p>
        <h2 className="text-2xl font-bold">{done.id}</h2>
        <p className="text-sm text-text2">{done.items}</p>
        <p className="text-sm">{formatGHS(total)} · it now waits in <b>Awaiting payment or check</b>.</p>
        {copied && <p role="status" className="rounded-[12px] bg-[#e3f5ee] p-2 text-sm font-medium text-success">Order summary copied. Paste it into WhatsApp.</p>}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Link href={`/dashboard/orders/${done.id}`} className="btn-primary">Open order</Link>
          <button type="button" className="btn-outline" onClick={() => { setDone(null); setLines([]); setName(""); setPhone(""); setPlace(""); setDiscount(0); setReason(""); setTried(false); setCopied(false); }}>Create another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Customer</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><L id="o-name">Name</L><input id="o-name" className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><L id="o-phone">Phone</L><input id="o-phone" className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 000 0000" /></div>
            <div><L id="o-region">Region</L><select id="o-region" className="field" value={region} onChange={(e) => setRegion(e.target.value)}>{zones.map((z) => <option key={z.region}>{z.region}</option>)}</select></div>
            <div><L id="o-place">Area</L><input id="o-place" className="field" value={place} onChange={(e) => setPlace(e.target.value)} /></div>
            {live && !pickup && (
              <>
                <div><L id="o-city">City or town</L><input id="o-city" className="field" value={city} onChange={(e) => setCity(e.target.value)} /></div>
                <div><L id="o-street">Street or landmark</L><input id="o-street" className="field" value={street} onChange={(e) => setStreet(e.target.value)} /></div>
              </>
            )}
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} className="size-5 accent-[#00115b]" />
            Pick up at the Accra branch (no delivery fee)
          </label>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Items</h2>
          <input className="field" placeholder="Search product, brand or SKU" aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
          {q.trim() && (
            <ul className="divide-y divide-line rounded-[12px] border border-line">
              {results.length === 0 && <li className="p-3 text-sm text-text2">No product matches.</li>}
              {results.map((p) => {
                const open = p.variants.filter((v) => v.availability !== "Unavailable").length;
                const first = variantsFor(p, { style: p.styles?.[0], colour: p.colours[0] });
                return (
                  <li key={p.slug}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-card"
                      onClick={() => {
                        const one = first.length === 1 && first[0].availability !== "Unavailable" ? first[0].size : "";
                        setLines((l) => [...l, { product: p, style: p.styles?.[0], colour: p.colours[0], size: one, qty: 1 }]);
                        setQ("");
                      }}
                    >
                      <span><b>{p.name}</b><br /><span className="text-text2">{p.priceVaries ? "From " : ""}{formatGHS(p.price)} · {open} of {p.variants.length} sizes can be supplied · lead time {p.leadDays} days</span></span>
                      <span className="text-navy">Add</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {lines.length === 0 && !q && <p className="text-sm text-text2">Live availability and lead time appear here for each size.</p>}
          <ul className="space-y-2">
            {lines.map((l, i) => {
              const options = variantsFor(l.product, { style: l.style, colour: l.colour });
              const picked = variantOf(l);
              const patch = (p: Partial<Line>) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-[12px] bg-card p-3 text-sm">
                  <span className="min-w-0 flex-1"><b>{l.product.name}</b><br /><span className="text-text2">{formatGHS(picked?.price ?? l.product.price)}</span></span>
                  {l.product.styles && (
                    <select aria-label="Style" className="min-h-10 rounded-[10px] border border-line bg-white px-2" value={l.style} onChange={(e) => patch({ style: e.target.value, size: "" })}>
                      {l.product.styles.map((st) => <option key={st}>{st}</option>)}
                    </select>
                  )}
                  {l.product.colours.length > 1 && (
                    <select aria-label="Colour" className="min-h-10 rounded-[10px] border border-line bg-white px-2" value={l.colour} onChange={(e) => patch({ colour: e.target.value, size: "" })}>
                      {l.product.colours.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  )}
                  <select aria-label="Size" className="min-h-10 rounded-[10px] border border-line bg-white px-2" value={l.size} onChange={(e) => patch({ size: e.target.value })}>
                    <option value="">Size</option>
                    {options.map((v) => <option key={v.size} value={v.size} disabled={v.availability === "Unavailable"}>{v.size}{v.availability === "Limited" ? " (limited)" : v.availability === "Unavailable" ? " (unavailable)" : ""}</option>)}
                  </select>
                  {picked && <Pill tone={picked.availability === "Available" ? "ok" : picked.availability === "Unavailable" ? "bad" : "warn"}>{picked.availability}</Pill>}
                  <input aria-label="Quantity" type="number" min={1} max={10} className="min-h-10 w-16 rounded-[10px] border border-line bg-white px-2" value={l.qty} onChange={(e) => patch({ qty: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />
                  <button type="button" className="text-text2 underline" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Delivery and payment</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><L id="o-channel">Channel</L><select id="o-channel" className="field" value={channel} onChange={(e) => setChannel(e.target.value as (typeof channels)[number])}>{channels.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><L id="o-plan">Payment plan</L>
              <select id="o-plan" className="field" value={effPlan} onChange={(e) => setPlan(e.target.value as "full" | "half")}>
                <option value="full">Pay in full</option>
                {canSplit && <option value="half">Half now, half on delivery</option>}
              </select>
              {!canSplit && <p className="mt-1 text-xs text-text2">Outside Accra, orders are paid in full.</p>}
            </div>
            <div><L id="o-disc">Manual discount (GHS)</L><input id="o-disc" type="number" min={0} className="field" value={discount || ""} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} /></div>
            <div><L id="o-reason">Reason for discount</L><input id="o-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
          <div><L id="o-src">How did they hear of Drezzy? (optional)</L>
            <select id="o-src" className="field" value={source} onChange={(e) => setSource(e.target.value)}><option value="">Not asked</option>{sources.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
        </section>
      </div>

      <aside className="card space-y-2 p-4 text-sm lg:sticky lg:top-4">
        <h2 className="font-semibold">Summary</h2>
        <p className="flex justify-between"><span>Subtotal</span><span>{formatGHS(subtotal)}</span></p>
        <p className="flex justify-between text-text2"><span>Delivery · about {lead} days</span><span>{formatGHS(fee)}</span></p>
        {discount > 0 && <p className="flex justify-between text-success"><span>Discount</span><span>−{formatGHS(discount)}</span></p>}
        <p className="flex justify-between border-t border-line pt-2 text-base font-bold"><span>Total</span><span>{formatGHS(total)}</span></p>
        <p className="flex justify-between rounded-[10px] bg-navy px-3 py-2 font-semibold text-white"><span>Due now</span><span className="text-lime">{formatGHS(due)}</span></p>
        {total > due && <p className="flex justify-between text-warning"><span>Balance on delivery</span><b>{formatGHS(total - due)}</b></p>}
        {tried && errors.length > 0 && <ul role="alert" className="list-disc space-y-1 pl-5 font-medium text-error">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        {serverError && <p role="alert" className="rounded-[10px] bg-[#fbe4e4] p-2 font-medium text-error">{serverError}</p>}
        <button type="button" disabled={busy} className="btn-primary mt-2 w-full disabled:opacity-60" onClick={() => create(false)}>{busy ? "Creating…" : "Create order"}</button>
        <button type="button" disabled={busy} className="btn-outline w-full disabled:opacity-60" onClick={() => create(true)}>Create and copy summary</button>
        <p className="text-xs text-text2">{live ? "The order waits for payment. Record the payment on the order when it arrives." : "Payment links arrive when Paystack is connected."}</p>
      </aside>
    </div>
  );
}
