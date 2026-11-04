"use server";

import { clientKey, limited } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * My Drezzy (PRD section 10). Everything runs with the shopper's own session; the database only ever returns their own
 * profile, addresses, wishlist, points and orders. Staff sign-ins are not shoppers and get nothing here.
 */

export type MyOrder = {
  number: string; phone: string; placed_at: string; status: string; payment_state: string;
  total: number | string; paid: number | string; balance: number | string; items: string[]; est?: string | null;
  lines?: { variant_id: string | null; qty: number; name: string; detail: string; price: number }[];
};
export type MyOrders = { signedIn: false } | { signedIn: true; email: string; orders: MyOrder[] };

export type Profile = {
  full_name: string | null; phone: string | null; birthday: string | null; gender: string | null; shoe_size_eu: string | null; clothing_size: string | null;
  style_tags: string[]; style_profile: Record<string, unknown> | null; notify_email: boolean; notify_sms: boolean; notify_whatsapp: boolean; topics: string[];
  marketing_consent_at: string | null; momo_number: string | null; referral_code: string; referred_by_code: string | null; email: string; points: number;
};
export type Address = { id: string; label: string; receiver_name: string | null; receiver_phone: string | null; region: string; city: string; area: string | null; street: string; landmark: string | null; gps_code: string | null; lat: number | null; lng: number | null; is_default: boolean };
type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const friendly = (m?: string) => (m && m.length < 140 && !/violates|constraint|function|permission|syntax|relation|duplicate key/i.test(m) ? m : "That did not work. Please try again.");

async function me() {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return null;
  return { supabase, email: typeof data.claims.email === "string" ? data.claims.email : "" };
}

/**
 * The signed-in shopper's orders. Orders placed as a guest with the same confirmed email are attached to the account first
 * (FR-ACC-012, AC-17). Staff sign-ins are not shoppers and get an empty list.
 */
export async function myOrdersAction(): Promise<MyOrders> {
  const s = await me();
  if (!s || !s.email) return { signedIn: false };
  await s.supabase.rpc("link_customer_orders");
  const { data: orders } = await s.supabase.rpc("my_orders");
  return { signedIn: true, email: s.email, orders: (orders ?? []) as MyOrder[] };
}

/** Sign in with email and password. Rate-limited per email and per connection, with a 15-minute lockout after 5 failures. */
export async function signInAction(email: string, password: string): Promise<R> {
  if (!isSupabaseConfigured) return { ok: false, error: "Accounts switch on once the shop is connected." };
  const e = email.trim().toLowerCase();
  if (limited("signin-ip", await clientKey(), 20, 15 * 60_000)) return { ok: false, error: "Too many attempts from this connection. Wait 15 minutes and try again." };
  if (limited("signin-email", e, 5, 15 * 60_000)) return { ok: false, error: "Too many attempts for this email. For your safety it is locked for 15 minutes. You can reset your password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: e, password });
  return error ? { ok: false, error: "That email and password do not match. Try again, or reset your password." } : { ok: true };
}

export async function profileAction(): Promise<R<Profile>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  const { data, error } = await s.supabase.rpc("my_profile");
  return error ? { ok: false, error: friendly(error.message) } : { ok: true, data: data as Profile };
}

export async function saveProfileAction(p: Partial<Profile> & { marketing?: boolean }): Promise<R> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  const { error } = await s.supabase.rpc("save_my_profile", { p });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function saveStyleAction(p: Record<string, unknown>): Promise<R> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  const { error } = await s.supabase.rpc("save_style_profile", { p });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function addressesAction(): Promise<R<Address[]>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  const { data, error } = await s.supabase.from("addresses").select("id, label, receiver_name, receiver_phone, region, city, area, street, landmark, gps_code, lat, lng, is_default").order("is_default", { ascending: false }).order("created_at");
  return error ? { ok: false, error: friendly(error.message) } : { ok: true, data: (data ?? []) as Address[] };
}

const norm = (p: string | null | undefined) => {
  const d = (p ?? "").replace(/[\s().-]/g, "");
  if (/^0\d{9}$/.test(d)) return `+233${d.slice(1)}`;
  if (/^233\d{9}$/.test(d)) return `+${d}`;
  if (/^\+233\d{9}$/.test(d)) return d;
  return null;
};

export async function saveAddressAction(a: Omit<Address, "id"> & { id?: string }): Promise<R> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  if (!a.region || a.city.trim().length < 2 || a.street.trim().length < 2) return { ok: false, error: "Add the region, city and a street or landmark." };
  if (a.receiver_phone && !norm(a.receiver_phone)) return { ok: false, error: "Enter the receiver's Ghana phone number." };
  if (a.gps_code && !/^[A-Z]{2}-?\d{3,4}-?\d{3,5}$/.test(a.gps_code.toUpperCase())) return { ok: false, error: "That Ghana Post GPS address does not look right (for example GA-123-4567)." };
  const { data: claims } = await s.supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string;
  if (a.is_default) await s.supabase.from("addresses").update({ is_default: false }).eq("user_id", uid).neq("id", a.id ?? "00000000-0000-0000-0000-000000000000");
  const row = {
    label: a.label, receiver_name: a.receiver_name?.trim() || null, receiver_phone: norm(a.receiver_phone), region: a.region, city: a.city.trim(), area: a.area?.trim() || null,
    street: a.street.trim(), landmark: a.landmark?.trim() || null, gps_code: a.gps_code?.toUpperCase() || null, lat: a.lat ?? null, lng: a.lng ?? null, is_default: a.is_default,
  };
  const { error } = a.id ? await s.supabase.from("addresses").update(row).eq("id", a.id) : await s.supabase.from("addresses").insert({ ...row, user_id: uid });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function deleteAddressAction(id: string): Promise<R> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  const { error } = await s.supabase.from("addresses").delete().eq("id", id);
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export type WishItem = { product_id: string; size: string | null; notify_available: boolean; notify_price: boolean };

export async function wishlistAction(): Promise<R<WishItem[]>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  const { data, error } = await s.supabase.from("wishlist_items").select("product_id, size, notify_available, notify_price");
  return error ? { ok: false, error: friendly(error.message) } : { ok: true, data: (data ?? []) as WishItem[] };
}

export async function wishlistToggleAction(productId: string, on: boolean, size?: string | null): Promise<R> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  const { error } = await s.supabase.rpc("wishlist_toggle", { p_product: productId, p_size: size ?? null, p_on: on });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

/** After signing in, the hearts saved on this device move into the account. */
export async function wishlistSyncAction(productIds: string[]): Promise<R> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  for (const id of productIds.slice(0, 100)) await s.supabase.rpc("wishlist_toggle", { p_product: id, p_size: null, p_on: true });
  return { ok: true };
}

export async function wishlistAlertsAction(productId: string, flags: { notify_available: boolean; notify_price: boolean }): Promise<R> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  const { error } = await s.supabase.from("wishlist_items").update(flags).eq("product_id", productId);
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

export async function rewardsAction(): Promise<R<{ points: { points: number; reason: string; created_at: string }[]; referrals: { code: string | null; joined: number; orders: number; people: string[] } }>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  const [p, r] = await Promise.all([
    s.supabase.from("loyalty_entries").select("points, reason, created_at").order("created_at", { ascending: false }).limit(50),
    s.supabase.rpc("my_referrals"),
  ]);
  if (p.error || r.error) return { ok: false, error: "Could not load your rewards." };
  return { ok: true, data: { points: (p.data ?? []) as { points: number; reason: string; created_at: string }[], referrals: r.data as { code: string | null; joined: number; orders: number; people: string[] } } };
}

/** "Download my data" (FR-ACC-011): everything held about the shopper, as JSON. The request is logged. */
export async function myDataAction(): Promise<R<string>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in first." };
  if (limited("my-data", await clientKey(), 3, 60 * 60_000)) return { ok: false, error: "Please try again later." };
  const { data, error } = await s.supabase.rpc("my_data_export");
  return error ? { ok: false, error: friendly(error.message) } : { ok: true, data: JSON.stringify(data, null, 2) };
}

/** What checkout can fill in for a signed-in shopper: their details and saved addresses (null for guests). */
export async function checkoutPrefillAction(): Promise<{ profile: Profile; addresses: Address[] } | null> {
  const s = await me();
  if (!s) return null;
  const [p, a] = await Promise.all([s.supabase.rpc("my_profile"), s.supabase.from("addresses").select("id, label, receiver_name, receiver_phone, region, city, area, street, landmark, gps_code, lat, lng, is_default").order("is_default", { ascending: false })]);
  if (p.error) return null;
  return { profile: p.data as Profile, addresses: (a.data ?? []) as Address[] };
}
