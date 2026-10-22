"use server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type MyOrder = {
  number: string; phone: string; placed_at: string; status: string; payment_state: string;
  total: number | string; paid: number | string; balance: number | string; items: string[];
};
export type MyOrders = { signedIn: false } | { signedIn: true; email: string; orders: MyOrder[] };

/**
 * The signed-in shopper's orders. Orders placed as a guest with the same confirmed email are attached to the account first.
 * Staff sign-ins are not shoppers and get an empty list.
 */
export async function myOrdersAction(): Promise<MyOrders> {
  if (!isSupabaseConfigured) return { signedIn: false };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  if (!data?.claims || !email) return { signedIn: false };
  await supabase.rpc("link_customer_orders");
  const { data: orders } = await supabase.rpc("my_orders");
  return { signedIn: true, email, orders: (orders ?? []) as MyOrder[] };
}
