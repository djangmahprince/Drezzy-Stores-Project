"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { placeOrderAction } from "@/app/(store)/checkout/actions";
import { Icon } from "@/components/Icon";
import { ProductArt } from "@/components/ProductArt";
import { PaymentFlow } from "@/components/store/PaymentFlow";
import type { PaymentOptions } from "@/lib/payments/config";
import type { PayChoice, PlaceResult } from "@/lib/orders/types";
import { clearCart, computeTotals, setRegion, usePricedCart, type Method, type Plan } from "@/lib/cart";
import { branches, formatGHS, getZone, sources, zones } from "@/lib/data";
import { isGhanaPhone, placeOrder, rememberOrder, type PlacedOrder } from "@/lib/orders";

type Pay = PayChoice;

const payOptions: { id: Pay; label: string; note: string; badge: string }[] = [
  { id: "mtn", label: "MTN MoMo", note: "Approve on your phone", badge: "MTN" },
  { id: "telecel", label: "Telecel Cash", note: "Approve on your phone", badge: "TCL" },
  { id: "airtel", label: "AirtelTigo Money", note: "Approve on your phone", badge: "AT" },
  { id: "card", label: "Visa or Mastercard", note: "Debit or credit card", badge: "CARD" },
  { id: "manual_momo", label: "Manual MoMo", note: "Pay to our number, then enter the transaction ID", badge: "MoMo" },
];

const isMomoNetwork = (p: Pay) => p === "mtn" || p === "telecel" || p === "airtel";

type Form = {
  name: string; phone: string; email: string;
  gift: boolean; receiverName: string; receiverPhone: string;
  city: string; area: string; street: string; gps: string; note: string;
  method: Method; plan: Plan; pay: Pay;
  momoSame: boolean; momo: string;
  source: string; sourceDetail: string; terms: boolean;
};

const initial: Form = {
  name: "", phone: "", email: "", gift: false, receiverName: "", receiverPhone: "",
  city: "", area: "", street: "", gps: "", note: "",
  method: "home", plan: "full", pay: "mtn", momoSame: true, momo: "",
  source: "", sourceDetail: "", terms: false,
};

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

function validate(f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.name.trim().length < 2) e.name = "Enter your full name.";
  if (!isGhanaPhone(f.phone)) e.phone = "Enter a Ghana number, for example 024 000 0000 or +233 24 000 0000.";
  if (!emailOk(f.email)) e.email = "Enter an email so we can send your receipt.";
  if (f.gift) {
    if (f.receiverName.trim().length < 2) e.receiverName = "Enter the receiver's name.";
    if (!isGhanaPhone(f.receiverPhone)) e.receiverPhone = "Enter the receiver's Ghana number.";
  }
  if (f.method === "home") {
    if (f.city.trim().length < 2) e.city = "Enter your city or town.";
    if (f.area.trim().length < 2) e.area = "Enter your area.";
    if (f.street.trim().length < 3) e.street = "Add a street or landmark so the rider can find you.";
  }
  if (isMomoNetwork(f.pay) && !f.momoSame && !isGhanaPhone(f.momo)) e.momo = "Enter the mobile money number to charge.";
  if (!f.source) e.source = "Please tell us how you got to know Drezzy.";
  else if ((f.source === "Referral" || f.source === "Influencer") && f.sourceDetail.trim().length < 2) {
    e.sourceDetail = f.source === "Referral" ? "Enter the name or code of who referred you." : "Enter the influencer's name.";
  }
  if (!f.terms) e.terms = "Please accept the Terms to continue.";
  return e;
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-text2">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-medium text-error">{error}</p>}
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="card p-4 md:p-5" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="flex items-center gap-3 text-base font-semibold">
        <span className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-navy text-lime" : "bg-navy text-white"}`}>
          {done ? <Icon name="check" size={14} /> : n}
        </span>
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Choice({ checked, onSelect, name, title, note, right, id }: { checked: boolean; onSelect: () => void; name: string; title: string; note?: string; right?: React.ReactNode; id: string }) {
  return (
    <label
      htmlFor={id}
      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-[12px] border p-3 text-sm transition-colors ${checked ? "border-navy bg-[#eef1fb] ring-1 ring-navy" : "border-line bg-white hover:border-navy"}`}
    >
      <input id={id} type="radio" name={name} checked={checked} onChange={onSelect} className="size-5 accent-[#00115b]" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {note && <span className="block text-text2">{note}</span>}
      </span>
      {right && <span className="shrink-0 font-semibold">{right}</span>}
    </label>
  );
}

/**
 * `live` is set when the shop is connected to the database: payment options then come from what the server has switched on
 * (Paystack, manual MoMo), orders are placed for real and priced by the database. Without it this is the demo checkout.
 */
export function CheckoutForm({ live }: { live?: PaymentOptions | null }) {
  const { region, priced } = usePricedCart();
  const options = useMemo(
    () => payOptions.filter((o) => (live ? (o.id === "manual_momo" ? !!live.manual : live.paystack) : o.id !== "manual_momo")),
    [live],
  );
  const [f, setF] = useState<Form>(() => ({ ...initial, pay: options[0]?.id ?? "mtn" }));
  const [placed, setPlaced] = useState<Extract<PlaceResult, { ok: true }> | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<"form" | "paying" | "placing" | "pay" | "done">("form");
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const activeRegion = f.method === "pickup" ? "Greater Accra" : region;
  const t = computeTotals(priced, activeRegion, f.method, f.plan);
  const plan: Plan = t.canSplit ? f.plan : "full";
  const totals = computeTotals(priced, activeRegion, f.method, plan);
  const errors = useMemo(() => validate(f), [f]);
  const show = (k: string) => (attempted || touched[k] ? errors[k] : undefined);
  const touch = (k: string) => () => setTouched((p) => ({ ...p, [k]: true }));
  const contactDone = !errors.name && !errors.phone && !errors.email && !errors.receiverName && !errors.receiverPhone;
  const placeDone = !errors.city && !errors.area && !errors.street;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    const keys = Object.keys(errors);
    if (keys.length) {
      const el = formRef.current?.querySelector<HTMLElement>(`#${keys[0] === "terms" ? "terms" : `f-${keys[0]}`}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
      return;
    }
    if (live) {
      void placeForReal();
      return;
    }
    setPhase("paying");
    // Demo checkout (no database connected): the payment prompt is simulated.
    window.setTimeout(() => {
      const placed = placeOrder({
        name: f.gift ? f.receiverName : f.name,
        phone: f.phone,
        email: f.email,
        region: activeRegion,
        city: f.method === "pickup" ? "Accra branch pickup" : f.city,
        area: f.method === "pickup" ? "" : f.area,
        method: f.method,
        plan,
        payMethod: payOptions.find((p) => p.id === f.pay)!.label,
        source: f.source,
        items: priced.map((l) => ({
          name: l.product.name,
          detail: [l.style, l.colour, l.size !== "One size" ? `Size ${l.size}` : null].filter(Boolean).join(" · "),
          qty: l.qty,
          price: l.unitPrice,
        })),
        total: totals.total,
        paid: totals.dueNow,
        balance: totals.dueLater,
      });
      setOrder(placed);
      clearCart();
      setPhase("done");
      window.scrollTo({ top: 0 });
    }, 2600);
  }

  async function placeForReal() {
    const items = priced.map((l) => ({ variantId: l.variantId ?? "", qty: l.qty }));
    if (items.some((i) => !i.variantId)) {
      setSubmitError("Something in your bag is out of date. Please remove it and add it again.");
      return;
    }
    setPhase("placing");
    setSubmitError(null);
    const res = await placeOrderAction({
      customer: { name: f.name, phone: f.phone, email: f.email },
      receiver: f.gift ? { name: f.receiverName, phone: f.receiverPhone } : null,
      delivery: { method: f.method, region: activeRegion, city: f.city, area: f.area, street: f.street, gps: f.gps, note: f.note },
      plan,
      source: f.source,
      sourceDetail: f.sourceDetail,
      items,
      payMethod: f.pay,
      momoPhone: isMomoNetwork(f.pay) && !f.momoSame ? f.momo : undefined,
    });
    if (!res.ok) {
      setSubmitError(res.error);
      setPhase("form");
      return;
    }
    // Remember it on this device now, so a card payment's return page can find the phone number to check with.
    setOrder(
      rememberOrder({
        id: res.number,
        placedAt: new Date().toISOString(),
        name: f.gift ? f.receiverName : f.name,
        phone: f.phone,
        email: f.email,
        region: activeRegion,
        city: f.method === "pickup" ? "Accra branch pickup" : f.city,
        area: f.method === "pickup" ? "" : f.area,
        method: f.method,
        plan,
        payMethod: options.find((p) => p.id === f.pay)!.label,
        source: f.source,
        items: priced.map((l) => ({
          name: l.product.name,
          detail: [l.style, l.colour, l.size !== "One size" ? `Size ${l.size}` : null].filter(Boolean).join(" · "),
          qty: l.qty,
          price: l.unitPrice,
        })),
        total: res.total,
        paid: res.dueNow,
        balance: res.balanceDue,
      }),
    );
    setPlaced(res);
    setPhase("pay");
    window.scrollTo({ top: 0 });
  }

  // The cart is only emptied once the payment is confirmed, so a failed payment keeps the bag (FR-CO-004).
  const onPaid = useCallback(() => {
    clearCart();
    setPhase("done");
    window.scrollTo({ top: 0 });
  }, []);

  if (phase === "pay" && placed && live) {
    return <PaymentFlow number={placed.number} phone={f.phone} email={f.email} dueNow={placed.dueNow} balanceDue={placed.balanceDue} step={placed.next} options={live} onPaid={onPaid} />;
  }

  if (phase === "done" && order) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-navy text-lime"><Icon name="check" size={32} /></span>
        <p className="label-wide mt-5 text-text2">Order placed</p>
        <h1 className="mt-2 text-[32px] font-extrabold uppercase leading-tight text-navy">Thank you, {order.name.split(" ")[0]}</h1>
        <p className="mt-2 text-text2">Your order number is <b className="text-ink">{order.id}</b>. Keep it, with your phone number, to follow your order.</p>

        <div className="card mt-6 space-y-3 p-5 text-left text-sm">
          {order.items.map((i, idx) => (
            <p key={idx} className="flex justify-between gap-3"><span>{i.name}<br /><span className="text-text2">{i.detail} · Qty {i.qty}</span></span><span className="font-semibold">{formatGHS(i.price * i.qty)}</span></p>
          ))}
          <div className="space-y-1 border-t border-line pt-3">
            <p className="flex justify-between"><span>Paid now · {order.payMethod}</span><b>{formatGHS(order.paid)}</b></p>
            {order.balance > 0 && <p className="flex justify-between rounded-[12px] bg-[#fbeedb] px-3 py-2 font-medium text-warning"><span>Balance to pay on delivery</span><b>{formatGHS(order.balance)}</b></p>}
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          <Link href={`/track?order=${order.id}&phone=${encodeURIComponent(order.phone)}`} className="btn-primary">Track this order</Link>
          <Link href="/shop" className="btn-outline">Keep shopping</Link>
        </div>
        {!live && <p className="mt-6 text-xs text-text2">Demo checkout: no real payment was taken.</p>}
      </div>
    );
  }

  if (priced.length === 0) {
    return (
      <div className="card mx-auto mt-4 flex max-w-lg flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-card text-navy"><Icon name="bag" size={30} /></span>
        <h1 className="text-[28px] font-bold">Your bag is empty. Let&apos;s fix that.</h1>
        <Link href="/shop" className="btn-primary mt-2">Start shopping</Link>
      </div>
    );
  }

  const inv = (k: string) => ({ id: `f-${k}`, "aria-invalid": !!show(k), "aria-describedby": show(k) ? `f-${k}-err` : undefined, onBlur: touch(k) });
  const chosen = options.find((p) => p.id === f.pay) ?? options[0];
  const payLabel = !chosen ? "Payment unavailable" : f.pay === "card" ? "Pay with card" : f.pay === "manual_momo" ? "Place order and pay by MoMo" : `Pay with ${chosen.label}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[28px] font-bold md:text-[40px]">Checkout</h1>
        <span className="chip gap-1.5 bg-white text-text2"><Icon name="shield" size={14} /> Secure</span>
      </div>
      {!live && (
        <p className="mb-6 rounded-[12px] border border-dashed border-warning/50 bg-[#fbeedb] px-4 py-2 text-sm text-warning">
          Demo checkout: payments are not connected yet, so no money is taken.
        </p>
      )}
      {live && options.length === 0 && (
        <p role="alert" className="mb-6 rounded-[12px] border border-warning/50 bg-[#fbeedb] px-4 py-3 text-sm text-warning">
          Online payment is being set up. To order now, WhatsApp us on {branches.accra.whatsapp} and we will take your order and payment there.
        </p>
      )}

      <form ref={formRef} onSubmit={submit} noValidate className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Step n={1} title="Contact" done={contactDone && (attempted || !!touched.phone)}>
            <Field id="f-name" label="Full name" error={show("name")}>
              <input {...inv("name")} value={f.name} onChange={(e) => set("name", e.target.value)} className="field" autoComplete="name" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="f-phone" label="Phone" error={show("phone")} hint="We call or message this number about your delivery.">
                <input {...inv("phone")} value={f.phone} onChange={(e) => set("phone", e.target.value)} className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="024 000 0000" />
              </Field>
              <Field id="f-email" label="Email (for your receipt)" error={show("email")}>
                <input {...inv("email")} value={f.email} onChange={(e) => set("email", e.target.value)} className="field" type="email" autoComplete="email" />
              </Field>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={f.gift} onChange={(e) => set("gift", e.target.checked)} className="size-5 accent-[#00115b]" />
              This is a gift, deliver to someone else
            </label>
            {f.gift && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="f-receiverName" label="Receiver's name" error={show("receiverName")}>
                  <input {...inv("receiverName")} value={f.receiverName} onChange={(e) => set("receiverName", e.target.value)} className="field" />
                </Field>
                <Field id="f-receiverPhone" label="Receiver's phone" error={show("receiverPhone")}>
                  <input {...inv("receiverPhone")} value={f.receiverPhone} onChange={(e) => set("receiverPhone", e.target.value)} className="field" type="tel" inputMode="tel" />
                </Field>
              </div>
            )}
          </Step>

          <Step n={2} title="Delivery" done={placeDone && (attempted || !!touched.street)}>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Delivery method">
              <Choice id="m-home" name="method" checked={f.method === "home"} onSelect={() => set("method", "home")} title="Home delivery" note={`About ${totals.days} ${totals.days === 1 ? "day" : "days"}, including getting it from our supplier`} right={formatGHS(getZone(region)?.fee ?? 0)} />
              <Choice id="m-pickup" name="method" checked={f.method === "pickup"} onSelect={() => set("method", "pickup")} title="Pick up at the Accra branch" note="We message you when it is ready" right="Free" />
            </div>

            {f.method === "home" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="f-region" label="Region">
                    <select id="f-region" value={region} onChange={(e) => setRegion(e.target.value)} className="field" autoComplete="address-level1">
                      {zones.map((z) => <option key={z.region}>{z.region}</option>)}
                    </select>
                  </Field>
                  <Field id="f-city" label="City or town" error={show("city")}>
                    <input {...inv("city")} value={f.city} onChange={(e) => set("city", e.target.value)} className="field" autoComplete="address-level2" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="f-area" label="Area" error={show("area")}>
                    <input {...inv("area")} value={f.area} onChange={(e) => set("area", e.target.value)} className="field" />
                  </Field>
                  <Field id="f-street" label="Street or landmark" error={show("street")}>
                    <input {...inv("street")} value={f.street} onChange={(e) => set("street", e.target.value)} className="field" autoComplete="street-address" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="f-gps" label="Ghana Post GPS (optional)" hint="For example GA-123-4567">
                    <input id="f-gps" value={f.gps} onChange={(e) => set("gps", e.target.value.toUpperCase())} className="field" placeholder="GA-000-0000" />
                  </Field>
                  <Field id="f-note" label="Note for the rider (optional)">
                    <input id="f-note" value={f.note} onChange={(e) => set("note", e.target.value)} className="field" />
                  </Field>
                </div>
              </>
            ) : (
              <p className="flex items-start gap-3 rounded-[12px] bg-card p-3 text-sm text-text2">
                <Icon name="pin" className="mt-0.5 text-navy" />
                <span>Collect from our Accra branch. Call {branches.accra.call} or WhatsApp {branches.accra.whatsapp} if you need directions.</span>
              </p>
            )}
          </Step>

          <Step n={3} title="How much to pay now">
            <p className="text-sm text-text2">Accra orders can be paid in two halves. Outside Accra, including Kumasi, orders are paid in full at checkout.</p>
            <div className="grid gap-2" role="radiogroup" aria-label="Payment plan">
              <Choice id="p-full" name="plan" checked={plan === "full"} onSelect={() => set("plan", "full")} title="Pay in full now" note="Nothing to pay when it arrives" right={formatGHS(totals.total)} />
              {t.canSplit && (
                <Choice id="p-half" name="plan" checked={plan === "half"} onSelect={() => set("plan", "half")} title="Pay half now, half on delivery" note="Accra only. Pay the rest to the rider by MoMo or cash" right={formatGHS(Math.ceil(totals.total / 2))} />
              )}
            </div>
            {!t.canSplit && (
              <p className="flex items-start gap-2 text-sm text-text2"><Icon name="shield" size={18} className="mt-0.5 text-navy" /> We source your item once payment is in, so orders outside Accra are paid in full.</p>
            )}
          </Step>

          <Step n={4} title="Payment method">
            <div className="grid gap-2" role="radiogroup" aria-label="Payment method">
              {options.map((o) => (
                <Choice
                  key={o.id}
                  id={`pay-${o.id}`}
                  name="pay"
                  checked={f.pay === o.id}
                  onSelect={() => set("pay", o.id)}
                  title={o.label}
                  note={o.note}
                  right={<span className="rounded-md bg-navy px-2 py-1 text-[10px] font-bold tracking-wide text-white">{o.badge}</span>}
                />
              ))}
            </div>
            {isMomoNetwork(f.pay) ? (
              <>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" checked={f.momoSame} onChange={(e) => set("momoSame", e.target.checked)} className="size-5 accent-[#00115b]" />
                  Use my contact phone for the payment prompt
                </label>
                {!f.momoSame && (
                  <Field id="f-momo" label="Mobile money number" error={show("momo")}>
                    <input {...inv("momo")} value={f.momo} onChange={(e) => set("momo", e.target.value)} className="field" type="tel" inputMode="tel" />
                  </Field>
                )}
                <p className="rounded-[12px] bg-card p-3 text-sm text-text2">A prompt will pop up on this phone. Approve it with your PIN to finish.</p>
              </>
            ) : f.pay === "manual_momo" ? (
              <p className="rounded-[12px] bg-card p-3 text-sm text-text2">On the next screen you will see our MoMo number and your order reference. Send the money, then enter the transaction ID. We confirm it by hand, which can take a few minutes.</p>
            ) : (
              <p className="rounded-[12px] bg-card p-3 text-sm text-text2">You will enter your card details on Paystack&apos;s secure page.</p>
            )}
            {f.pay !== "manual_momo" && <p className="text-xs text-text2">Payments are processed securely by Paystack. Drezzy never sees your PIN or card number.</p>}
          </Step>

          <Step n={5} title="How did you get to know Drezzy Stores?" done={!!f.source}>
            <p className="text-sm text-text2">Required. It helps us know where to show up for you.</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How did you get to know Drezzy Stores?" id="f-source" tabIndex={-1}>
              {sources.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={f.source === s}
                  onClick={() => set("source", s)}
                  className={`chip min-h-11 px-4 text-sm font-medium transition-colors ${f.source === s ? "bg-navy text-white" : "border border-line bg-white text-ink hover:border-navy"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            {show("source") && <p role="alert" className="text-sm font-medium text-error">{errors.source}</p>}
            {(f.source === "Referral" || f.source === "Influencer" || f.source === "Other") && (
              <Field id="f-sourceDetail" label={f.source === "Referral" ? "Who referred you? (name or code)" : f.source === "Influencer" ? "Which influencer?" : "Tell us more (optional)"} error={show("sourceDetail")}>
                <input {...inv("sourceDetail")} value={f.sourceDetail} onChange={(e) => set("sourceDetail", e.target.value)} className="field" />
              </Field>
            )}
          </Step>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-32">
          <div className="card p-5">
            <h2 className="font-semibold">Order summary</h2>
            <ul className="mt-3 space-y-3">
              {priced.map((l) => (
                <li key={l.key} className="flex gap-3 text-sm">
                  <span className="size-14 shrink-0 overflow-hidden rounded-[12px]"><ProductArt {...l.product.art} label="" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.product.name}</span>
                    <span className="block text-xs text-text2">{[l.style, l.colour, l.size !== "One size" ? `Size ${l.size}` : null].filter(Boolean).join(" · ")} · Qty {l.qty}</span>
                  </span>
                  <span className="font-semibold">{formatGHS(l.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <p className="flex justify-between"><span>Subtotal</span><span>{formatGHS(totals.subtotal)}</span></p>
              <p className="flex justify-between text-text2"><span>Delivery</span><span>{totals.fee === 0 ? "Free" : formatGHS(totals.fee)}</span></p>
              <p className="flex justify-between border-t border-line pt-3 text-base font-bold"><span>Total</span><span>{formatGHS(totals.total)}</span></p>
              <p className="flex justify-between rounded-[12px] bg-navy px-3 py-2 font-semibold text-white"><span>Pay now</span><span className="text-lime">{formatGHS(totals.dueNow)}</span></p>
              {totals.dueLater > 0 && <p className="flex justify-between text-warning"><span>Balance on delivery</span><b>{formatGHS(totals.dueLater)}</b></p>}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input id="terms" type="checkbox" checked={f.terms} onChange={(e) => set("terms", e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#00115b]" aria-invalid={!!show("terms")} />
            <span>I agree to the <Link href="/help/terms" className="underline">Terms</Link></span>
          </label>
          {show("terms") && <p role="alert" className="-mt-2 text-sm font-medium text-error">{errors.terms}</p>}

          {submitError && <p role="alert" className="rounded-[12px] bg-[#fbe4e4] px-3 py-2 text-sm font-medium text-error">{submitError}</p>}
          <button type="submit" disabled={!chosen || phase === "placing"} className="btn-lime w-full !text-base disabled:opacity-60">{payLabel} · {formatGHS(totals.dueNow)}</button>
          {attempted && Object.keys(errors).length > 0 && (
            <p role="alert" className="text-center text-sm font-medium text-error">Please fix {Object.keys(errors).length === 1 ? "1 thing" : `${Object.keys(errors).length} things`} above to continue.</p>
          )}
          <p className="text-center text-xs text-text2">Need a hand? WhatsApp {branches.accra.whatsapp} (Accra) or {branches.kumasi.whatsapp} (Kumasi).</p>
        </aside>
      </form>

      {phase === "placing" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/90 p-6 text-center text-white" role="alertdialog" aria-live="assertive" aria-label="Placing your order">
          <div className="max-w-sm">
            <span className="mx-auto block size-14 animate-spin rounded-full border-4 border-white/20 border-t-lime" />
            <h2 className="mt-6 text-2xl font-extrabold uppercase">Placing your order</h2>
            <p className="mt-2 text-white/80">One moment. Please do not close this page.</p>
          </div>
        </div>
      )}

      {phase === "paying" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/90 p-6 text-center text-white" role="alertdialog" aria-live="assertive" aria-label="Waiting for payment">
          <div className="max-w-sm">
            <span className="mx-auto block size-14 animate-spin rounded-full border-4 border-white/20 border-t-lime" />
            <h2 className="mt-6 text-2xl font-extrabold uppercase">{f.pay === "card" ? "Opening secure payment" : "Check your phone"}</h2>
            <p className="mt-2 text-white/80">
              {f.pay === "card" ? "Taking you to Paystack to enter your card." : "Payment prompt sent to your phone. Approve it to finish."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
