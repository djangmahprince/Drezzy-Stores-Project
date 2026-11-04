"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  addressesAction, deleteAddressAction, myDataAction, rewardsAction, saveAddressAction, saveProfileAction, wishlistAction, wishlistAlertsAction,
  type Address, type MyOrder, type Profile, type WishItem,
} from "@/app/(store)/account/actions";
import { dataRequestAction, supportPostAction, supportThreadsAction, type Thread } from "@/app/(store)/actions";
import { useCatalogue } from "@/components/CatalogueProvider";
import { ProductCard } from "@/components/store/ProductCard";
import { Empty, MiniProgress, Note, statusWord } from "@/components/store/account/parts";
import { addToCart, useWishlist } from "@/lib/cart";
import { formatGHS } from "@/lib/data";
import { createClient } from "@/lib/supabase/browser";

type Msg = { text: string; bad?: boolean } | null;
const day = (iso?: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "");

// ---------------------------------------------------------------- Orders (FR-ACC-006)
export function OrdersTab({ orders }: { orders: MyOrder[] }) {
  const { products } = useCatalogue();
  const [msg, setMsg] = useState<Msg>(null);
  function reorder(o: MyOrder) {
    let added = 0;
    for (const l of o.lines ?? []) {
      const p = products.find((x) => x.variants.some((v) => v.id === l.variant_id));
      const v = p?.variants.find((x) => x.id === l.variant_id);
      if (p && v && v.availability !== "Unavailable") {
        addToCart(p, { size: v.size, colour: v.colour, style: v.style }, l.qty);
        added++;
      }
    }
    setMsg(added ? { text: `${added} item(s) added to your bag.` } : { text: "Those items are not available right now.", bad: true });
  }
  if (!orders.length) {
    return <Empty title="No orders yet" text="Orders you place while signed in, or as a guest with this email, show up here."><Link href="/shop" className="btn-primary">Start shopping</Link><Link href="/track" className="btn-outline">Track an order</Link></Empty>;
  }
  return (
    <div className="space-y-3">
      <Note msg={msg} />
      {orders.map((o) => (
        <article key={o.number} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{o.number} <span className="text-sm font-normal text-text2">· {day(o.placed_at)}</span></p>
            <span className="chip bg-[#e6eaf8] text-navy">{o.payment_state === "pending_check" ? "Payment being checked" : (statusWord[o.status] ?? o.status)}</span>
          </div>
          <p className="mt-1 text-sm text-text2">{o.items.join(", ")}</p>
          <MiniProgress status={o.status} />
          <p className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
            <span>Total {formatGHS(Number(o.total))} · Paid {formatGHS(Number(o.paid))}</span>
            {Number(o.balance) > 0 && o.status !== "cancelled" && <span className="font-medium text-warning">Balance {formatGHS(Number(o.balance))} on delivery</span>}
          </p>
          {o.est && !["delivered", "cancelled"].includes(o.status) && <p className="text-xs text-text2">Expected by {day(o.est)}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/track?order=${o.number}&phone=${encodeURIComponent(o.phone)}`} className="btn-primary !min-h-10 !px-4 text-sm">Track</Link>
            <a href={`/api/invoice?number=${encodeURIComponent(o.number)}`} className="btn-outline !min-h-10 !px-4 text-sm">Invoice (PDF)</a>
            {(o.lines?.length ?? 0) > 0 && <button type="button" onClick={() => reorder(o)} className="btn-outline !min-h-10 !px-4 text-sm">Reorder</button>}
            {o.status === "delivered" && <Link href={`/track?order=${o.number}&phone=${encodeURIComponent(o.phone)}#review`} className="btn-outline !min-h-10 !px-4 text-sm">Review</Link>}
          </div>
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Wishlist with alerts (FR-ACC-007)
export function WishlistTab({ signedIn }: { signedIn: boolean }) {
  const { get, products } = useCatalogue();
  const local = useWishlist();
  const [server, setServer] = useState<WishItem[]>([]);
  useEffect(() => {
    if (signedIn) void wishlistAction().then((r) => r.ok && setServer(r.data ?? []));
  }, [signedIn]);
  const ids = new Set(server.map((s) => s.product_id));
  const saved = [...local.map((s) => get(s)).filter((p): p is NonNullable<typeof p> => !!p), ...products.filter((p) => p.id && ids.has(p.id) && !local.includes(p.slug))];
  if (!saved.length) return <Empty title="Nothing saved yet" text="Tap the heart on any product to save it here."><Link href="/shop" className="btn-primary">Browse the shop</Link></Empty>;
  return (
    <>
      {!signedIn && <p className="mb-4 rounded-[12px] bg-card p-3 text-sm text-text2">Sign in to get an email when a saved item comes back or drops in price.</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
        {saved.map((p) => {
          const w = server.find((s) => s.product_id === p.id);
          return (
            <div key={p.slug}>
              <ProductCard product={p} />
              {signedIn && w && (
                <div className="mt-2 space-y-1 text-xs">
                  {(["notify_available", "notify_price"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-2">
                      <input type="checkbox" checked={w[k]} className="accent-[#00115b]" onChange={async (e) => {
                        const next = { ...w, [k]: e.target.checked };
                        setServer((s) => s.map((x) => (x.product_id === w.product_id ? next : x)));
                        await wishlistAlertsAction(w.product_id, { notify_available: next.notify_available, notify_price: next.notify_price });
                      }} />
                      {k === "notify_available" ? "Tell me when it is back" : "Tell me if the price drops"}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Profile, sizes and style (FR-ACC-004)
export function ProfileTab({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [p, setP] = useState(profile);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const styles = ["Streetwear", "Smart casual", "Sporty", "Minimal", "Bold colours", "Classic", "Church and occasions", "Campus"];
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    const r = await saveProfileAction({ ...p, marketing: !!p.marketing_consent_at });
    setMsg(r.ok ? { text: "Saved." } : { text: r.error, bad: true });
    setBusy(false);
    if (r.ok) onSaved();
  }
  return (
    <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm"><span className="mb-1 block font-medium">Full name</span><input className="field" value={p.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} autoComplete="name" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Phone</span><input className="field" value={p.phone ?? ""} onChange={(e) => set("phone", e.target.value)} type="tel" inputMode="tel" placeholder="024 000 0000" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Birthday (optional)</span><input className="field" type="date" value={p.birthday ?? ""} onChange={(e) => set("birthday", e.target.value)} /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Gender (optional)</span>
          <select className="field" value={p.gender ?? ""} onChange={(e) => set("gender", e.target.value || null)}>
            <option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
          </select></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Shoe size (EU)</span><input className="field" value={p.shoe_size_eu ?? ""} onChange={(e) => set("shoe_size_eu", e.target.value)} inputMode="numeric" placeholder="42" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Clothing size</span>
          <select className="field" value={p.clothing_size ?? ""} onChange={(e) => set("clothing_size", e.target.value || null)}>
            <option value="">Not set</option>{["XS", "S", "M", "L", "XL", "XXL", "3XL"].map((s) => <option key={s}>{s}</option>)}
          </select></label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Your style</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {styles.map((s) => {
            const on = p.style_tags.includes(s);
            return <button key={s} type="button" aria-pressed={on} onClick={() => set("style_tags", on ? p.style_tags.filter((x) => x !== s) : [...p.style_tags, s])} className={`chip min-h-10 px-4 ${on ? "bg-navy text-white" : "border border-line bg-white text-ink"}`}>{s}</button>;
          })}
        </div>
        <Link href="/style-quiz" className="mt-2 inline-block text-sm font-semibold text-navy underline">Not sure? Take the 6-question style quiz</Link>
      </fieldset>
      <Note msg={msg} />
      <button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save"}</button>
    </form>
  );
}

// ---------------------------------------------------------------- Address book (FR-ACC-005)
const blank: Omit<Address, "id"> = { label: "Home", receiver_name: "", receiver_phone: "", region: "Greater Accra", city: "", area: "", street: "", landmark: "", gps_code: "", lat: null, lng: null, is_default: false };

export function AddressesTab() {
  const { zones } = useCatalogue();
  const [list, setList] = useState<Address[] | null>(null);
  const [edit, setEdit] = useState<(Omit<Address, "id"> & { id?: string }) | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = () => addressesAction().then((r) => setList(r.ok ? r.data ?? [] : []));
  useEffect(() => void load(), []);
  async function save() {
    if (!edit) return;
    const r = await saveAddressAction(edit);
    setMsg(r.ok ? { text: "Address saved." } : { text: r.error, bad: true });
    if (r.ok) {
      setEdit(null);
      void load();
    }
  }
  function locate() {
    if (!navigator.geolocation || !edit) return;
    navigator.geolocation.getCurrentPosition((pos) => setEdit((e) => (e ? { ...e, lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) } : e)), () => setMsg({ text: "We could not get your location. You can type the address instead.", bad: true }));
  }
  if (list === null) return <div className="h-40 animate-pulse rounded-[12px] bg-white" />;
  return (
    <div className="space-y-3">
      <Note msg={msg} />
      {list.map((a) => (
        <div key={a.id} className="card flex flex-wrap items-start justify-between gap-3 p-4 text-sm">
          <div>
            <p className="font-semibold">{a.label} {a.is_default && <span className="chip ml-1 bg-lime text-navy">Default</span>}</p>
            <p className="text-text2">{[a.street, a.landmark, a.area, a.city, a.region].filter(Boolean).join(", ")}</p>
            {a.receiver_name && <p className="text-text2">For {a.receiver_name} {a.receiver_phone}</p>}
            {a.gps_code && <p className="text-text2">GPS {a.gps_code}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline !min-h-10 !px-3 text-sm" onClick={() => setEdit({ ...a })}>Edit</button>
            <button type="button" className="btn-outline !min-h-10 !px-3 text-sm" onClick={async () => { await deleteAddressAction(a.id); void load(); }}>Remove</button>
          </div>
        </div>
      ))}
      {!edit && <button type="button" className="btn-primary" onClick={() => setEdit({ ...blank, is_default: list.length === 0 })}>Add an address</button>}
      {edit && (
        <form className="card grid gap-3 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label className="text-sm"><span className="mb-1 block font-medium">Label</span>
            <select className="field" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })}>{["Home", "Work", "Receiver", "Other"].map((l) => <option key={l}>{l}</option>)}</select></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Region</span>
            <select className="field" value={edit.region} onChange={(e) => setEdit({ ...edit, region: e.target.value })}>{zones.map((z) => <option key={z.region}>{z.region}</option>)}</select></label>
          <label className="text-sm"><span className="mb-1 block font-medium">City or town</span><input className="field" value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Area</span><input className="field" value={edit.area ?? ""} onChange={(e) => setEdit({ ...edit, area: e.target.value })} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Street</span><input className="field" value={edit.street} onChange={(e) => setEdit({ ...edit, street: e.target.value })} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Landmark</span><input className="field" value={edit.landmark ?? ""} onChange={(e) => setEdit({ ...edit, landmark: e.target.value })} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Ghana Post GPS (optional)</span><input className="field" value={edit.gps_code ?? ""} onChange={(e) => setEdit({ ...edit, gps_code: e.target.value.toUpperCase() })} placeholder="GA-123-4567" /></label>
          <div className="text-sm"><span className="mb-1 block font-medium">Pin (optional)</span>
            <button type="button" className="btn-outline w-full" onClick={locate}>{edit.lat ? "Location added ✓" : "Use my current location"}</button></div>
          {edit.label === "Receiver" && (
            <>
              <label className="text-sm"><span className="mb-1 block font-medium">Receiver&apos;s name</span><input className="field" value={edit.receiver_name ?? ""} onChange={(e) => setEdit({ ...edit, receiver_name: e.target.value })} /></label>
              <label className="text-sm"><span className="mb-1 block font-medium">Receiver&apos;s phone</span><input className="field" type="tel" value={edit.receiver_phone ?? ""} onChange={(e) => setEdit({ ...edit, receiver_phone: e.target.value })} /></label>
            </>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={edit.is_default} onChange={(e) => setEdit({ ...edit, is_default: e.target.checked })} className="size-5 accent-[#00115b]" /> Use as my default delivery address</label>
          <div className="flex gap-2 sm:col-span-2"><button className="btn-primary">Save address</button><button type="button" className="btn-outline" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Rewards and referrals (FR-ACC-009, 010)
export function RewardsTab({ profile }: { profile: Profile }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof rewardsAction>> | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => void rewardsAction().then(setD), []);
  const link = typeof window !== "undefined" ? `${window.location.origin}/account?ref=${profile.referral_code}` : "";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-[24px] bg-navy p-6 text-white">
        <p className="label-wide text-lime">Drezzy points</p>
        <p className="mt-2 text-5xl font-extrabold">{profile.points}</p>
        <p className="mt-2 text-sm text-white/80">You earn 1 point for every GHS 10 of a delivered order.</p>
      </section>
      <section className="card p-5">
        <h2 className="font-semibold">Invite friends</h2>
        <p className="mt-1 text-sm text-text2">Share your code. Friends enter it at checkout under &ldquo;Referral&rdquo;.</p>
        <p className="mt-3 text-3xl font-extrabold tracking-wider text-navy">{profile.referral_code}</p>
        <button type="button" className="btn-outline mt-3 !min-h-10" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}>{copied ? "Link copied" : "Copy invite link"}</button>
        {d?.ok && d.data && <p className="mt-3 text-sm text-text2">{d.data.referrals.joined} joined · {d.data.referrals.orders} orders placed with your code</p>}
      </section>
      <section className="card p-5 md:col-span-2">
        <h2 className="font-semibold">Points history</h2>
        {d?.ok && d.data?.points.length ? (
          <ul className="mt-2 divide-y divide-line text-sm">{d.data.points.map((x, i) => <li key={i} className="flex justify-between py-2"><span>{x.reason} · {day(x.created_at)}</span><b>+{x.points}</b></li>)}</ul>
        ) : <p className="mt-2 text-sm text-text2">No points yet. They arrive when an order is delivered.</p>}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Messages (FR-DB-009)
export function MessagesTab({ orders }: { orders: MyOrder[] }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [body, setBody] = useState("");
  const [order, setOrder] = useState("");
  const [reply, setReply] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const load = () => supportThreadsAction().then((r) => setThreads(r.ok ? r.data ?? [] : []));
  useEffect(() => void load(), []);
  async function send(thread?: string) {
    const text = thread ? reply[thread] : body;
    if (!text?.trim()) return;
    const o = orders.find((x) => x.number === order);
    const r = await supportPostAction({ thread, body: text, number: !thread && o ? o.number : undefined, phone: !thread && o ? o.phone : undefined });
    setMsg(r.ok ? { text: "Sent. We usually reply within an hour in opening hours." } : { text: r.error, bad: true });
    if (r.ok) {
      setBody("");
      setReply((x) => ({ ...x, [thread ?? ""]: "" }));
      void load();
    }
  }
  return (
    <div className="space-y-4">
      <form className="card space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <h2 className="font-semibold">Message Drezzy</h2>
        {orders.length > 0 && (
          <select className="field" value={order} onChange={(e) => setOrder(e.target.value)} aria-label="About which order">
            <option value="">Not about a specific order</option>{orders.map((o) => <option key={o.number} value={o.number}>{o.number}</option>)}
          </select>
        )}
        <textarea className="field py-2" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="How can we help?" aria-label="Your message" />
        <button className="btn-primary !min-h-10">Send</button>
      </form>
      <Note msg={msg} />
      {threads === null ? <div className="h-24 animate-pulse rounded-[12px] bg-white" /> : threads.length === 0 ? <p className="text-sm text-text2">No conversations yet.</p> : threads.map((t) => (
        <section key={t.id} className="card p-4">
          <p className="font-semibold">{t.subject} <span className="chip ml-1 bg-card text-text2">{t.status === "waiting" ? "Replied" : t.status}</span></p>
          <ul className="mt-3 space-y-2">
            {t.messages.map((m, i) => (
              <li key={i} className={`max-w-[85%] rounded-[12px] px-3 py-2 text-sm ${m.from_staff ? "bg-navy text-white" : "ml-auto bg-card"}`}>
                <p>{m.body}</p><p className={`mt-1 text-[11px] ${m.from_staff ? "text-white/70" : "text-text2"}`}>{m.from_staff ? `${m.name}, Drezzy` : "You"} · {day(m.at)}</p>
              </li>
            ))}
          </ul>
          {t.status !== "closed" && (
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(t.id); }}>
              <input className="field" value={reply[t.id] ?? ""} onChange={(e) => setReply((x) => ({ ...x, [t.id]: e.target.value }))} placeholder="Reply" aria-label="Reply" />
              <button className="btn-primary !min-h-12">Send</button>
            </form>
          )}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Notification settings (FR-ACC-008)
export function NotificationsTab({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [p, setP] = useState(profile);
  const [marketing, setMarketing] = useState(!!profile.marketing_consent_at);
  const [msg, setMsg] = useState<Msg>(null);
  const topics = [["drops", "Drops and restocks"], ["drip_school", "Drip School stories"], ["offers", "Offers and discount days"]] as const;
  async function save() {
    const r = await saveProfileAction({ ...p, marketing });
    setMsg(r.ok ? { text: "Saved." } : { text: r.error, bad: true });
    if (r.ok) onSaved();
  }
  return (
    <form className="card space-y-5 p-5 text-sm" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <fieldset>
        <legend className="font-semibold">Order updates</legend>
        <p className="mt-1 text-text2">Always by email, so you never miss a payment or delivery update. You can add:</p>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={p.notify_whatsapp} onChange={(e) => setP({ ...p, notify_whatsapp: e.target.checked })} className="size-5 accent-[#00115b]" /> WhatsApp</label>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={p.notify_sms} onChange={(e) => setP({ ...p, notify_sms: e.target.checked })} className="size-5 accent-[#00115b]" /> SMS</label>
      </fieldset>
      <fieldset>
        <legend className="font-semibold">News and offers</legend>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="size-5 accent-[#00115b]" /> Yes, send me news and offers</label>
        {marketing && topics.map(([k, l]) => (
          <label key={k} className="ml-7 mt-2 flex items-center gap-2"><input type="checkbox" checked={p.topics.includes(k)} onChange={(e) => setP({ ...p, topics: e.target.checked ? [...p.topics, k] : p.topics.filter((x) => x !== k) })} className="size-5 accent-[#00115b]" /> {l}</label>
        ))}
        <p className="mt-2 text-xs text-text2">Every marketing email has a one-click unsubscribe link.</p>
      </fieldset>
      <Note msg={msg} />
      <button className="btn-primary">Save</button>
    </form>
  );
}

// ---------------------------------------------------------------- Account settings and data rights (FR-ACC-011, 013)
export function SettingsTab({ email, onSignedOut }: { email: string; onSignedOut: () => void }) {
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [del, setDel] = useState("");
  async function changePassword() {
    if (pass.length < 8) return setMsg({ text: "Use at least 8 characters.", bad: true });
    const { error } = await createClient().auth.updateUser({ password: pass });
    setMsg(error ? { text: "We could not change it. Sign in again and retry.", bad: true } : { text: "Password changed." });
    if (!error) setPass("");
  }
  async function download() {
    const r = await myDataAction();
    if (!r.ok || !r.data) return setMsg({ text: r.ok ? "Nothing to download." : r.error, bad: true });
    const url = URL.createObjectURL(new Blob([r.data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-drezzy-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-4 text-sm">
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Sign-in</h2>
        <p className="text-text2">Signed in as <b className="text-ink">{email}</b></p>
        <div className="flex gap-2"><input type="password" autoComplete="new-password" className="field" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="New password" aria-label="New password" /><button type="button" onClick={() => void changePassword()} className="btn-primary">Change</button></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" onClick={async () => { await createClient().auth.signOut(); onSignedOut(); }}>Sign out</button>
          <button type="button" className="btn-outline" onClick={async () => { await createClient().auth.signOut({ scope: "global" }); onSignedOut(); }}>Sign out on all devices</button>
        </div>
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-text2">Under Ghana&apos;s Data Protection Act you can see, correct or delete what we hold. We answer requests within 30 days.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" onClick={() => void download()}>Download my data</button>
          <button type="button" className="btn-outline" onClick={async () => { const r = await dataRequestAction("withdraw_consent", "From My Drezzy"); setMsg(r.ok ? { text: "Done. We will not send you marketing." } : { text: r.error, bad: true }); }}>Withdraw marketing consent</button>
        </div>
        <label className="block"><span className="mb-1 block font-medium">Correct something, or delete my account</span>
          <textarea className="field py-2" rows={2} value={del} onChange={(e) => setDel(e.target.value)} placeholder="Tell us what to correct, or write DELETE to close your account" /></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" onClick={async () => { const r = await dataRequestAction("correct", del); setMsg(r.ok ? { text: "Request sent. We will reply by email." } : { text: r.error, bad: true }); }}>Ask for a correction</button>
          <button type="button" className="btn-outline !text-error" onClick={async () => {
            if (del.trim().toUpperCase() !== "DELETE") return setMsg({ text: "Write DELETE in the box to confirm.", bad: true });
            const r = await dataRequestAction("delete", "Close my account");
            setMsg(r.ok ? { text: "Request sent. We keep order and payment records the law requires, without your name." } : { text: r.error, bad: true });
          }}>Delete my account</button>
        </div>
      </section>
      <Note msg={msg} />
    </div>
  );
}
