import "server-only";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CustomerRow = { id: string; name: string; phone: string; email: string | null; source: string | null; region: string | null; orders: number; spent: number; last: string | null };
export type CustomersData = { rows: CustomerRow[]; /** Dispatch sees delivery details only: no email, source or spend. */ deliveryOnly: boolean; q: string; truncated: boolean };

type Row = { id: string; full_name: string; phone: string; email: string | null; source: string | null; orders: { amount_paid: number | string; status: string; created_at: string; region: string | null }[] | null };
const LIMIT = 200;

/** Customers the signed-in person may see (row-level security decides), newest first, with order counts. */
export async function getCustomers(q: string): Promise<CustomersData> {
  const me = await requireStaff();
  const deliveryOnly = /^delivery/i.test(me.permissions.customers?.restriction ?? "");
  // a search term goes into a filter, so keep only characters a name, phone number or email can contain
  const term = q.trim().replace(/[^\p{L}\p{N}@.+\- ]/gu, "").slice(0, 60);
  let query = (await createClient()).from("customers").select("id, full_name, phone, email, source, orders(amount_paid, status, created_at, region)").order("created_at", { ascending: false }).limit(LIMIT + 1);
  if (term) query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term.replace(/^0/, "+233")}%,email.ilike.%${term}%`);
  const { data } = await query;
  const list = ((data ?? []) as unknown as Row[]);
  return {
    q: term,
    deliveryOnly,
    truncated: list.length > LIMIT,
    rows: list.slice(0, LIMIT).map((c) => {
      const live = (c.orders ?? []).filter((o) => o.status !== "cancelled");
      const last = [...live].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return {
        id: c.id, name: c.full_name, phone: c.phone, email: deliveryOnly ? null : c.email, source: deliveryOnly ? null : c.source,
        region: last?.region ?? null, orders: live.length, spent: deliveryOnly ? 0 : live.reduce((s, o) => s + Number(o.amount_paid), 0), last: last?.created_at ?? null,
      };
    }),
  };
}
