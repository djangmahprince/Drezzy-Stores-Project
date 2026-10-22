"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { myOrdersAction, type MyOrders } from "@/app/(store)/account/actions";
import { trackOrderAction } from "@/app/(store)/checkout/actions";
import { createClient } from "@/lib/supabase/browser";
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

const statusWord: Record<string, string> = {
  awaiting_payment: "Awaiting payment", to_confirm: "Payment confirmed", to_source: "Confirmed by Drezzy", ready_to_pack: "Item received at our branch",
  packed: "Checked and packed", dispatched: "Dispatched", out_for_delivery: "Out for delivery", delivered: "Delivered", failed_delivery: "Delivery attempt failed", cancelled: "Cancelled",
};

export function AccountView({ live = false }: { live?: boolean }) {
  const [tab, setTab] = useState<Tab>("orders");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const [acct, setAcct] = useState<MyOrders | null>(null);
  const [authMsg, setAuthMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPass, setNewPass] = useState("");
  const orders = useOrders();

  const refreshAccount = () => myOrdersAction().then(setAcct).catch(() => setAcct({ signedIn: false }));
  useEffect(() => {
    if (!live) return;
    // the link in the confirmation or reset email brings the shopper back here with a one-time code
    const code = new URLSearchParams(window.location.search).get("code");
    const ready = code
      ? createClient().auth.exchangeCodeForSession(code).then(() => window.history.replaceState(null, "", window.location.pathname)).catch(() => {})
      : Promise.resolve();
    const reset = new URLSearchParams(window.location.search).get("reset") === "1";
    void ready.then(() => {
      if (reset) {
        setResetting(true);
        setTab("signin");
      }
      return refreshAccount();
    });
  }, [live]);

  async function saveNewPassword() {
    if (newPass.length < 8) return setAuthMsg({ text: "Use at least 8 characters.", bad: true });
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: newPass });
    setAuthMsg(error ? { text: "We could not change your password. Open the reset link in your email again.", bad: true } : { text: "Your password is changed.", bad: false });
    if (!error) { setResetting(false); setNewPass(""); window.history.replaceState(null, "", window.location.pathname); }
    setBusy(false);
  }

  async function submitAuth() {
    setTried(true);
    if (emailErr || passErr) return;
    if (!live) return;
    setBusy(true);
    setAuthMsg(null);
    const supabase = createClient();
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthMsg({ text: "That email and password do not match. Try again, or reset your password.", bad: true });
      else {
        setPassword("");
        await refreshAccount();
        setTab("orders");
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/account` } });
      setAuthMsg(error
        ? { text: error.message.toLowerCase().includes("already") ? "That email already has an account. Sign in instead." : "We could not create the account. Please try again.", bad: true }
        : { text: "Check your email and tap the link to confirm your account. Your orders appear here once you have.", bad: false });
    }
    setBusy(false);
  }

  async function resetPassword() {
    if (emailErr) return setAuthMsg({ text: "Enter your email above first.", bad: true });
    setBusy(true);
    await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/account?reset=1` });
    setAuthMsg({ text: "If that email has an account, a reset link is on its way.", bad: false });
    setBusy(false);
  }

  async function signOut() {
    await createClient().auth.signOut();
    setAcct({ signedIn: false });
  }

  const accountNumbers = new Set(acct?.signedIn ? acct.orders.map((o) => o.number) : []);
  const { get } = useCatalogue();
  const saved = useWishlist().flatMap((s) => {
    const p = get(s);
    return p ? [p] : [];
  });

  const emailErr = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "Enter a valid email address." : "";
  const passErr = password.length < 8 ? "Use at least 8 characters." : "";

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "orders", label: "Orders", count: orders.filter((o) => !accountNumbers.has(o.id)).length + (acct?.signedIn ? acct.orders.length : 0) },
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
          orders.length === 0 && !(acct?.signedIn && acct.orders.length > 0) ? (
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
              {acct?.signedIn && acct.orders.map((o) => (
                <li key={o.number} className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{o.number}</p>
                    <span className="chip bg-[#e6eaf8] text-navy">{o.payment_state === "pending_check" ? "Payment being checked" : (statusWord[o.status] ?? o.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-text2">{o.items.join(", ")}</p>
                  <p className="mt-2 flex justify-between text-sm"><span>Paid {formatGHS(Number(o.paid))}</span>{Number(o.balance) > 0 && o.status !== "cancelled" && <span className="font-medium text-warning">Balance {formatGHS(Number(o.balance))} on delivery</span>}</p>
                  <Link href={`/track?order=${o.number}&phone=${encodeURIComponent(o.phone)}`} className="mt-3 inline-block text-sm font-semibold text-navy underline">Track this order</Link>
                </li>
              ))}
              {orders.filter((o) => !accountNumbers.has(o.id)).map((o) => (
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

        {tab === "signin" && acct?.signedIn && (
          <div className="card mx-auto max-w-md space-y-3 p-5">
            <p className="text-sm text-text2">Signed in as</p>
            <p className="font-semibold">{acct.email}</p>
            {resetting && (
              <div className="space-y-2">
                <label htmlFor="a-newpass" className="block text-sm font-medium">New password</label>
                <input id="a-newpass" type="password" autoComplete="new-password" className="field" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                <button type="button" disabled={busy} onClick={() => void saveNewPassword()} className="btn-primary">Save new password</button>
              </div>
            )}
            {authMsg && <p role="status" className={`rounded-[12px] p-3 text-sm ${authMsg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{authMsg.text}</p>}
            <button type="button" onClick={() => void signOut()} className="btn-outline">Sign out</button>
          </div>
        )}

        {tab === "signin" && !acct?.signedIn && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitAuth();
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
            <button disabled={busy} className="btn-primary w-full disabled:opacity-60">{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</button>
            {live && mode === "in" && <button type="button" onClick={() => void resetPassword()} className="text-sm text-navy underline">Forgot your password?</button>}
            {authMsg && <p role="status" className={`rounded-[12px] p-3 text-sm ${authMsg.bad ? "bg-[#fbe4e4] text-error" : "bg-[#e3f5ee] text-success"}`}>{authMsg.text}</p>}
            {!live && tried && !emailErr && !passErr && (
              <p role="status" className="rounded-[12px] bg-[#fbeedb] p-3 text-sm text-warning">
                Accounts switch on once the shop is connected. You can already check out as a guest and track any order with its number.
              </p>
            )}
            <p className="text-sm text-text2">An account gives you faster checkout, order history and wishlist alerts.</p>
          </form>
        )}
      </div>
    </div>
  );
}
