"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackOrderAction } from "@/app/(store)/checkout/actions";
import { Icon } from "@/components/Icon";
import { ProductCard } from "@/components/store/ProductCard";
import { useWishlist } from "@/lib/cart";
import { useCatalogue } from "@/components/CatalogueProvider";
import { formatGHS } from "@/lib/data";
import { useOrders } from "@/lib/orders";

type Tab = "orders" | "wishlist" | "signin";

/** The order's live status from the tracker. Shows "Order placed" until the lookup answers, or when tracking is not connected. */
function StatusChip({ number, phone }: { number: string; phone: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    trackOrderAction({ number, phone }).then((r) => { if (live && r.ok) setText(r.track.headline); }).catch(() => {});
    return () => { live = false; };
  }, [number, phone]);
  return <span className="chip bg-[#e6eaf8] text-navy" aria-live="polite">{text ?? "Order placed"}</span>;
}

export function AccountView() {
  const [tab, setTab] = useState<Tab>("orders");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const orders = useOrders();
  const { get } = useCatalogue();
  const saved = useWishlist().flatMap((s) => {
    const p = get(s);
    return p ? [p] : [];
  });

  const emailErr = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "Enter a valid email address." : "";
  const passErr = password.length < 8 ? "Use at least 8 characters." : "";

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "orders", label: "Orders", count: orders.length },
    { id: "wishlist", label: "Wishlist", count: saved.length },
    { id: "signin", label: "Sign in" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <p className="label-wide text-text2">My Drezzy</p>
      <h1 className="mt-2 text-[28px] font-bold md:text-[40px]">Your space</h1>

      <div className="mt-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="My Drezzy">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} id={t.id === "wishlist" ? "wishlist" : undefined} className={`chip min-h-11 shrink-0 gap-2 px-5 text-sm ${tab === t.id ? "bg-navy text-white" : "bg-white text-navy hover:bg-card"}`}>
            {t.label}
            {t.count ? <span className={`rounded-full px-1.5 text-[11px] ${tab === t.id ? "bg-lime text-navy" : "bg-card"}`}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-6" role="tabpanel">
        {tab === "orders" && (
          orders.length === 0 ? (
            <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-card text-navy"><Icon name="truck" size={26} /></span>
              <p className="text-lg font-semibold">No orders yet</p>
              <p className="max-w-sm text-sm text-text2">Orders you place on this device show up here. Already ordered? Track it with your order number.</p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <Link href="/shop" className="btn-primary">Start shopping</Link>
                <Link href="/track" className="btn-outline">Track an order</Link>
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => (
                <li key={o.id} className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{o.id}</p>
                    <StatusChip number={o.id} phone={o.phone} />
                  </div>
                  <p className="mt-1 text-sm text-text2">{o.items.map((i) => i.name).join(", ")}</p>
                  <p className="mt-2 flex justify-between text-sm"><span>Paid {formatGHS(o.paid)}</span>{o.balance > 0 && <span className="font-medium text-warning">Balance {formatGHS(o.balance)} on delivery</span>}</p>
                  <Link href={`/track?order=${o.id}&phone=${encodeURIComponent(o.phone)}`} className="mt-3 inline-block text-sm font-semibold text-navy underline">Track this order</Link>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === "wishlist" && (
          saved.length === 0 ? (
            <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-card text-navy"><Icon name="heart" size={26} /></span>
              <p className="text-lg font-semibold">Nothing saved yet</p>
              <p className="max-w-sm text-sm text-text2">Tap the heart on any product to save it here.</p>
              <Link href="/shop" className="btn-primary mt-1">Browse the shop</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
              {saved.map((p) => <ProductCard key={p.slug} product={p} />)}
            </div>
          )
        )}

        {tab === "signin" && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setTried(true);
            }}
            className="card mx-auto max-w-md space-y-4 p-5"
          >
            <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-card p-1" role="group" aria-label="Sign in or sign up">
              {(["in", "up"] as const).map((m) => (
                <button type="button" key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`min-h-10 rounded-[10px] text-sm font-semibold ${mode === m ? "bg-white text-navy shadow-sm" : "text-text2"}`}>
                  {m === "in" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="a-email" className="mb-1 block text-sm font-medium">Email</label>
              <input id="a-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className="field" aria-invalid={tried && !!emailErr} />
              {tried && emailErr && <p role="alert" className="mt-1 text-sm font-medium text-error">{emailErr}</p>}
            </div>
            <div>
              <label htmlFor="a-pass" className="mb-1 block text-sm font-medium">Password</label>
              <input id="a-pass" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} className="field" aria-invalid={tried && !!passErr} />
              {tried && passErr && <p role="alert" className="mt-1 text-sm font-medium text-error">{passErr}</p>}
            </div>
            <button className="btn-primary w-full">{mode === "in" ? "Sign in" : "Create account"}</button>
            {tried && !emailErr && !passErr && (
              <p role="status" className="rounded-[12px] bg-[#fbeedb] p-3 text-sm text-warning">
                Accounts are switching on soon. You can already check out as a guest and track any order with its number.
              </p>
            )}
            <p className="text-sm text-text2">An account gives you faster checkout, order history and wishlist alerts.</p>
          </form>
        )}
      </div>
    </div>
  );
}
