import { getStaffState } from "@/lib/auth";
import { toCsv, type Column } from "@/lib/export/csv";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;
const ghs = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * A CSV download. It reads with the signed-in person's own session, so row-level security decides what is in the file:
 * a Sales agent with "own records" gets only their orders, and a role without Money access gets an error for the ledger.
 * Every download is written to the export log.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured) return new Response("Connect Supabase first", { status: 503 });
  const state = await getStaffState();
  if (state.status !== "ok") return new Response("Sign in first", { status: 401 });
  const { permissions } = state.staff;
  if (!can(permissions, "exports", "export")) return new Response("You cannot export data", { status: 403 });

  const kind = new URL(request.url).searchParams.get("kind") ?? "";
  // roles limited to "Catalogue only" may export the catalogue and nothing else
  const catalogueOnly = /^catalogue/i.test(permissions.exports?.restriction ?? "");
  if (catalogueOnly && kind !== "catalogue") return new Response("Your role can export the catalogue only", { status: 403 });

  const supabase = await createClient();
  let rows: Row[] = [];
  let columns: Column<Row>[] = [];
  let error: { message: string } | null = null;

  if (kind === "orders") {
    const r = await supabase.from("orders").select("number, created_at, channel, status, payment_state, subtotal, delivery_fee, discount, total, amount_paid, balance_due, region, city, source, agent_name, customer:customers(full_name, phone)").order("created_at", { ascending: false }).limit(20000);
    error = r.error; rows = (r.data ?? []) as unknown as Row[];
    columns = [
      { header: "Order", value: (o) => o.number as string }, { header: "Placed", value: (o) => o.created_at as string }, { header: "Channel", value: (o) => o.channel as string },
      { header: "Status", value: (o) => o.status as string }, { header: "Payment", value: (o) => o.payment_state as string },
      { header: "Customer", value: (o) => one(o.customer as { full_name: string } | { full_name: string }[])?.full_name }, { header: "Phone", value: (o) => one(o.customer as { phone: string } | { phone: string }[])?.phone },
      { header: "Region", value: (o) => o.region as string }, { header: "City", value: (o) => o.city as string }, { header: "Source", value: (o) => o.source as string }, { header: "Agent", value: (o) => o.agent_name as string },
      { header: "Subtotal (GHS)", value: (o) => ghs(o.subtotal) }, { header: "Delivery fee (GHS)", value: (o) => ghs(o.delivery_fee) }, { header: "Discount (GHS)", value: (o) => ghs(o.discount) },
      { header: "Total (GHS)", value: (o) => ghs(o.total) }, { header: "Paid (GHS)", value: (o) => ghs(o.amount_paid) }, { header: "Balance (GHS)", value: (o) => ghs(o.balance_due) },
    ];
  } else if (kind === "customers") {
    const r = await supabase.from("customers").select("full_name, phone, email, source, created_at").order("created_at", { ascending: false }).limit(20000);
    error = r.error; rows = (r.data ?? []) as unknown as Row[];
    columns = [
      { header: "Name", value: (c) => c.full_name as string }, { header: "Phone", value: (c) => c.phone as string }, { header: "Email", value: (c) => c.email as string },
      { header: "Source", value: (c) => c.source as string }, { header: "Joined", value: (c) => c.created_at as string },
    ];
  } else if (kind === "money") {
    const r = await supabase.from("money_ledger").select("at, direction, category, amount, branch, method, label").order("at", { ascending: false }).limit(20000);
    error = r.error; rows = (r.data ?? []) as unknown as Row[];
    columns = [
      { header: "When", value: (m) => m.at as string }, { header: "Direction", value: (m) => m.direction as string }, { header: "Category", value: (m) => m.category as string },
      { header: "Amount (GHS)", value: (m) => ghs(m.amount) }, { header: "Branch", value: (m) => m.branch as string }, { header: "Method", value: (m) => m.method as string }, { header: "Detail", value: (m) => m.label as string },
    ];
  } else if (kind === "catalogue") {
    const r = await supabase.from("variants").select("sku, style, colour, size, price, availability, lead_days, product:products(name)").order("sku").limit(20000);
    error = r.error; rows = (r.data ?? []) as unknown as Row[];
    columns = [
      { header: "SKU", value: (v) => v.sku as string }, { header: "Product", value: (v) => one(v.product as { name: string } | { name: string }[])?.name }, { header: "Style", value: (v) => v.style as string },
      { header: "Colour", value: (v) => v.colour as string }, { header: "Size", value: (v) => v.size as string }, { header: "Price (GHS)", value: (v) => ghs(v.price) },
      { header: "Availability", value: (v) => v.availability as string }, { header: "Lead days", value: (v) => v.lead_days as number },
    ];
  } else {
    return new Response("Choose orders, customers, money or catalogue", { status: 400 });
  }

  if (error) return new Response("You cannot export that, or something went wrong", { status: 403 });
  await supabase.rpc("log_export", { p_kind: kind, p_rows: rows.length });

  // the byte-order mark makes Excel read the file as UTF-8, so names with accents are not garbled
  return new Response("﻿" + toCsv(rows, columns), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="drezzy-${kind}.csv"`, "Cache-Control": "no-store" },
  });
}
