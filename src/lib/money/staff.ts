import "server-only";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type LedgerRow = { at: string; direction: "in" | "out"; category: string; amount: number; branch: string; method: string; label: string; source: string };
export type MoneySummary = { moneyIn: number; moneyOut: number; net: number; owed: number; byCategory: { category: string; amount: number }[] };

export type MoneyData = {
  month: string; // YYYY-MM
  label: string;
  prev: string;
  next: string;
  summary: MoneySummary | null; // null for roles limited to one expense category
  ledger: LedgerRow[];
  canAdd: boolean;
  /** Owner and Finance: a link to the salary records. */
  canSeeSalaries: boolean;
  /** Categories this person may record, in the form the expense action expects. */
  categories: { value: string; label: string }[];
};

const ALL = [
  { value: "supplier_costs", label: "Supplier costs" }, { value: "delivery_and_riders", label: "Delivery and riders" },
  { value: "ads_and_promotion", label: "Ads and promotion" }, { value: "rent_and_utilities", label: "Rent and utilities" },
  { value: "packaging", label: "Packaging" }, { value: "other", label: "Other" },
];

const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** One month of money records. `month` is YYYY-MM, in Accra time (UTC). */
export async function getMoney(month: string): Promise<MoneyData> {
  const me = await requireStaff();
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // last day of the month
  const supabase = await createClient();

  const [{ data: sum }, { data: rows }] = await Promise.all([
    supabase.rpc("money_summary", { p_from: from, p_to: to }),
    supabase.from("money_ledger").select("*").gte("at", from).lt("at", new Date(Date.UTC(y, m, 1)).toISOString()).order("at", { ascending: false }).limit(300),
  ]);

  const s = sum as { money_in: number; money_out: number; net: number; balances_to_collect: number; out_by_category: { category: string; amount: number }[] } | null;
  return {
    month,
    label: new Intl.DateTimeFormat("en-GH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1))),
    prev: shift(month, -1),
    next: shift(month, 1),
    summary: s ? { moneyIn: Number(s.money_in), moneyOut: Number(s.money_out), net: Number(s.net), owed: Number(s.balances_to_collect), byCategory: s.out_by_category.map((c) => ({ category: c.category, amount: Number(c.amount) })) } : null,
    ledger: ((rows ?? []) as { at: string; direction: "in" | "out"; category: string; amount: number | string; branch: string; method: string; label: string; source: string }[]).map((r) => ({ ...r, amount: Number(r.amount) })),
    canAdd: can(me.permissions, "expenses", "create"),
    canSeeSalaries: can(me.permissions, "salary", "view"),
    categories: ALL,
  };
}
