"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { myOrdersAction, profileAction, wishlistSyncAction, type MyOrders, type Profile } from "@/app/(store)/account/actions";
import { trackOrderAction } from "@/app/(store)/checkout/actions";
import { useCatalogue } from "@/components/CatalogueProvider";
import { AuthPanel } from "@/components/store/account/AuthPanel";
import { Empty, Note } from "@/components/store/account/parts";
import { AddressesTab, MessagesTab, NotificationsTab, OrdersTab, ProfileTab, RewardsTab, SettingsTab, WishlistTab } from "@/components/store/account/Tabs";
import { useWishlist } from "@/lib/cart";
import { formatGHS } from "@/lib/data";
import { useOrders } from "@/lib/orders";
import { refreshShopper } from "@/lib/shopper";
import { createClient } from "@/lib/supabase/browser";

type Tab = "orders" | "wishlist" | "profile" | "addresses" | "rewards" | "messages" | "notifications" | "settings" | "signin";

/** The order's live status from the tracker, for orders placed on this device as a guest. */
function StatusChip({ number, phone }: { number: string; phone: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    trackOrderAction({ number, phone }).then((r) => { if (live && r.ok) setText(r.track.headline); }).catch(() => {});
    return () => { live = false; };
  }, [number, phone]);
  return <span className="chip bg-[#e6eaf8] text-navy" aria-live="polite">{text ?? "Order placed"}</span>;
}

/**
 * My Drezzy (PRD section 10): Orders, Wishlist, Saved sizes and style, Addresses, Rewards, Messages, Notifications and
 * Account settings. Guests see the orders placed on this device and their device wishlist, and are invited to sign in.
 */
export function AccountView({ live = false }: { live?: boolean }) {
  const [tab, setTab] = useState<Tab>("orders");
  const [acct, setAcct] = useState<MyOrders | null>(live ? null : { signedIn: false });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resetMsg, setResetMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [newPass, setNewPass] = useState("");
  const deviceOrders = useOrders();
  const localWish = useWishlist();
  const { get } = useCatalogue();

  async function refresh() {
    const a = await myOrdersAction().catch(() => ({ signedIn: false }) as MyOrders);
    setAcct(a);
    if (a.signedIn) {
      const p = await profileAction();
      if (p.ok && p.data) setProfile(p.data);
      // hearts saved on this device move into the account, so alerts work
      const ids = localWish.map((s) => get(s)?.id).filter((x): x is string => !!x);
      if (ids.length) void wishlistSyncAction(ids);
    } else setProfile(null);
    void refreshShopper();
  }

  useEffect(() => {
    if (!live) return;
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code");
    const ready = code ? createClient().auth.exchangeCodeForSession(code).then(() => window.history.replaceState(null, "", window.location.pathname)).catch(() => {}) : Promise.resolve();
    const want = (q.get("tab") ?? window.location.hash.slice(1)) as Tab;
    void ready.then(() => {
      if (q.get("reset") === "1") setResetting(true);
      if (want) setTab(want);
      return refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  async function saveNewPassword() {
    if (newPass.length < 8) return setResetMsg({ text: "Use at least 8 characters.", bad: true });
    const { error } = await createClient().auth.updateUser({ password: newPass });
    setResetMsg(error ? { text: "The reset link has expired or was already used. Ask for a new one.", bad: true } : { text: "Your password is changed." });
    if (!error) { setResetting(false); setNewPass(""); window.history.replaceState(null, "", window.location.pathname); }
  }

  const signedIn = !!acct?.signedIn;
  const accountNumbers = new Set(acct?.signedIn ? acct.orders.map((o) => o.number) : []);
  const guestOrders = deviceOrders.filter((o) => !accountNumbers.has(o.id));
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "orders", label: "Orders", show: true },
    { id: "wishlist", label: "Wishlist", show: true },
    { id: "profile", label: "Sizes and style", show: signedIn },
    { id: "addresses", label: "Addresses", show: signedIn },
    { id: "rewards", label: "Rewards", show: signedIn },
    { id: "messages", label: "Messages", show: signedIn },
    { id: "notifications", label: "Notifications", show: signedIn },
    { id: "settings", label: "Account", show: signedIn },
    { id: "signin", label: "Sign in", show: !signedIn },
  ];
  const current = tabs.find((t) => t.id === tab && t.show) ? tab : "orders";

  return (
    <div className="mx-auto max-w-4xl">
      <p className="label-wide text-text2">My Drezzy</p>
      <h1 className="mt-2 text-[28px] font-bold md:text-[40px]">{profile?.full_name ? `Hi, ${profile.full_name.split(" ")[0]}` : "Your space"}</h1>

      {resetting && signedIn && (
        <div className="card mt-4 max-w-md space-y-2 p-4">
          <label htmlFor="a-newpass" className="block text-sm font-medium">Choose a new password</label>
          <input id="a-newpass" type="password" autoComplete="new-password" className="field" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          <button type="button" onClick={() => void saveNewPassword()} className="btn-primary">Save new password</button>
          <Note msg={resetMsg} />
        </div>
      )}

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="My Drezzy">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.id} role="tab" aria-selected={current === t.id} onClick={() => setTab(t.id)} className={`chip min-h-11 shrink-0 px-5 text-sm ${current === t.id ? "bg-navy text-white" : "bg-white text-navy hover:bg-card"}`}>{t.label}</button>
        ))}
      </div>

      <div className="mt-6" role="tabpanel">
        {current === "orders" && (
          <>
            {signedIn && acct?.signedIn && <OrdersTab orders={acct.orders} />}
            {guestOrders.length > 0 && (
              <section className={signedIn ? "mt-6" : ""}>
                {signedIn && <h2 className="mb-2 font-semibold">Ordered on this device</h2>}
                <ul className="space-y-3">
                  {guestOrders.map((o) => (
                    <li key={o.id} className="card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{o.id}</p><StatusChip number={o.id} phone={o.phone} /></div>
                      <p className="mt-1 text-sm text-text2">{o.items.map((i) => i.name).join(", ")}</p>
                      <p className="mt-2 flex justify-between text-sm"><span>Paid {formatGHS(o.paid)}</span>{o.balance > 0 && <span className="font-medium text-warning">Balance {formatGHS(o.balance)} on delivery</span>}</p>
                      <Link href={`/track?order=${o.id}&phone=${encodeURIComponent(o.phone)}`} className="mt-3 inline-block text-sm font-semibold text-navy underline">Track this order</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!signedIn && guestOrders.length === 0 && (
              <Empty title="No orders yet" text="Orders you place on this device show up here. Sign in to see your orders on any device.">
                <Link href="/shop" className="btn-primary">Start shopping</Link>
                <button type="button" onClick={() => setTab("signin")} className="btn-outline">Sign in</button>
              </Empty>
            )}
          </>
        )}
        {current === "wishlist" && <WishlistTab signedIn={signedIn} />}
        {current === "profile" && profile && <ProfileTab profile={profile} onSaved={() => void refresh()} />}
        {current === "addresses" && <AddressesTab />}
        {current === "rewards" && profile && <RewardsTab profile={profile} />}
        {current === "messages" && acct?.signedIn && <MessagesTab orders={acct.orders} />}
        {current === "notifications" && profile && <NotificationsTab profile={profile} onSaved={() => void refresh()} />}
        {current === "settings" && acct?.signedIn && <SettingsTab email={acct.email} onSignedOut={() => { setTab("orders"); void refresh(); }} />}
        {current === "signin" && <AuthPanel live={live} onSignedIn={() => { setTab("orders"); void refresh(); }} />}
      </div>
    </div>
  );
}
