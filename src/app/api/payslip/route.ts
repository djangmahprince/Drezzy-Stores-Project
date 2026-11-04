import { getStaffState } from "@/lib/auth";
import { payslipPdf } from "@/lib/pdf/docs";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** A payslip PDF (FR-FIN-007). Salary records are readable by Owner and Finance only; the database enforces it too. */
export async function GET(request: Request) {
  if (!isSupabaseConfigured) return new Response("Connect Supabase first", { status: 503 });
  const state = await getStaffState();
  if (state.status !== "ok" || !can(state.staff.permissions, "salary", "view")) return new Response("Not allowed", { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Choose a salary record", { status: 400 });
  const { data } = await (await createClient())
    .from("salary_records")
    .select("month, amount, allowances, deductions, paid_on, method, reference, note, staff:staff(full_name, role:roles(name))")
    .eq("id", id)
    .maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });
  const d = data as unknown as { month: string; amount: number; allowances: number; deductions: number; paid_on: string | null; method: string | null; reference: string | null; note: string | null;
    staff: { full_name: string; role: { name: string } | { name: string }[] } | { full_name: string; role: { name: string } | { name: string }[] }[] };
  const s = Array.isArray(d.staff) ? d.staff[0] : d.staff;
  const role = Array.isArray(s?.role) ? s.role[0] : s?.role;
  const month = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d.month));
  const pdf = await payslipPdf({
    staff: s?.full_name ?? "", role: role?.name ?? "", month, amount: Number(d.amount), allowances: Number(d.allowances ?? 0), deductions: Number(d.deductions ?? 0),
    paidOn: d.paid_on, method: d.method, reference: d.reference, note: d.note,
  });
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="payslip-${d.month.slice(0, 7)}.pdf"`, "Cache-Control": "no-store" },
  });
}
