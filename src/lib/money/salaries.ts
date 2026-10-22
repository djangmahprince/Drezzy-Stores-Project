import "server-only";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type SalaryRow = { staffId: string; name: string; role: string; recordId: string | null; amount: number | null; status: "due" | "paid" | null; paidOn: string | null; method: string | null; note: string | null };
export type SalaryData = { month: string; label: string; prev: string; next: string; canEdit: boolean; rows: SalaryRow[]; paid: number; due: number };

const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Every active staff member with their salary record for the month, if one exists. Owner and Finance only (the database enforces it too). */
export async function getSalaries(month: string): Promise<SalaryData> {
  const me = await requireStaff();
  await connection();
  const supabase = await createClient();
  const [{ data: staff }, { data: recs }] = await Promise.all([
    supabase.from("staff").select("id, full_name, role:roles(name)").eq("active", true).order("full_name"),
    supabase.from("salary_records").select("id, staff_id, amount, status, paid_on, method, note").eq("month", `${month}-01`),
  ]);
  const byStaff = new Map((recs ?? []).map((r) => [r.staff_id as string, r]));
  const rows: SalaryRow[] = ((staff ?? []) as unknown as { id: string; full_name: string; role: { name: string } | { name: string }[] | null }[]).map((s) => {
    const r = byStaff.get(s.id);
    return {
      staffId: s.id, name: s.full_name, role: (Array.isArray(s.role) ? s.role[0]?.name : s.role?.name) ?? "",
      recordId: (r?.id as string) ?? null, amount: r ? Number(r.amount) : null, status: (r?.status as "due" | "paid") ?? null, paidOn: (r?.paid_on as string) ?? null, method: (r?.method as string) ?? null, note: (r?.note as string) ?? null,
    };
  });
  const label = new Intl.DateTimeFormat("en-GH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  return {
    month, label, prev: shift(month, -1), next: shift(month, 1), canEdit: can(me.permissions, "salary", "create"), rows,
    paid: rows.filter((r) => r.status === "paid").reduce((s, r) => s + (r.amount ?? 0), 0),
    due: rows.filter((r) => r.status === "due").reduce((s, r) => s + (r.amount ?? 0), 0),
  };
}
