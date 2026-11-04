import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Column } from "@/lib/export/csv";
import { exportKinds, kindLabels, type ExportKind } from "@/lib/export/kinds";

type Row = Record<string, unknown>;
export type Dataset = { title: string; columns: Column<Row>[]; rows: Row[] };
export type Filters = { from?: string; to?: string; status?: string; region?: string; channel?: string; q?: string; month?: string; tag?: string; source?: string };

export { exportKinds, kindLabels };
export type { ExportKind };

const ghs = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Builds an export with the signed-in person's own session, so row-level security decides what is in the file: a Sales
 * agent gets only their own orders, and a role without Money access gets an error for the ledger. Filters narrow it down.
 */
export async function buildDataset(supabase: SupabaseClient, kind: ExportKind, f: Filters): Promise<Dataset> {
  switch (kind) {
    case "orders": {
      let q = supabase.from("orders").select("number, created_at, channel, status, payment_state, payment_plan, subtotal, delivery_fee, discount, coupon_code, total, amount_paid, balance_due, region, city, source, utm_source, agent_name, rider_name, courier, tracking_number, customer:customers(full_name, phone)").order("created_at", { ascending: false }).limit(50000);
      if (isDate(f.from)) q = q.gte("created_at", f.from!);
      if (isDate(f.to)) q = q.lt("created_at", new Date(new Date(f.to!).getTime() + 86_400_000).toISOString());
      if (f.status) q = q.eq("status", f.status);
      if (f.region) q = q.eq("region", f.region);
      if (f.channel) q = q.eq("channel", f.channel);
      const r = await q;
      if (r.error) throw r.error;
      return {
        title: "Orders", rows: (r.data ?? []) as Row[], columns: [
          { header: "Order", value: (o) => s(o.number) }, { header: "Placed", value: (o) => s(o.created_at) }, { header: "Channel", value: (o) => s(o.channel) },
          { header: "Status", value: (o) => s(o.status) }, { header: "Payment", value: (o) => s(o.payment_state) }, { header: "Plan", value: (o) => s(o.payment_plan) },
          { header: "Customer", value: (o) => one(o.customer as { full_name: string })?.full_name }, { header: "Phone", value: (o) => one(o.customer as { phone: string })?.phone },
          { header: "Region", value: (o) => s(o.region) }, { header: "City", value: (o) => s(o.city) }, { header: "Said they found us", value: (o) => s(o.source) },
          { header: "Tracked source", value: (o) => s(o.utm_source) }, { header: "Agent", value: (o) => s(o.agent_name) }, { header: "Rider", value: (o) => s(o.rider_name) },
          { header: "Courier", value: (o) => s(o.courier) }, { header: "Tracking", value: (o) => s(o.tracking_number) }, { header: "Coupon", value: (o) => s(o.coupon_code) },
          { header: "Subtotal (GHS)", value: (o) => ghs(o.subtotal) }, { header: "Delivery (GHS)", value: (o) => ghs(o.delivery_fee) }, { header: "Discount (GHS)", value: (o) => ghs(o.discount) },
          { header: "Total (GHS)", value: (o) => ghs(o.total) }, { header: "Paid (GHS)", value: (o) => ghs(o.amount_paid) }, { header: "Balance (GHS)", value: (o) => ghs(o.balance_due) },
        ],
      };
    }
    case "customers": {
      const r = await supabase.rpc("customer_directory", { p: { q: f.q ?? "", region: f.region ?? "", tag: f.tag ?? "", source: f.source ?? "", limit: 500, offset: 0 } });
      if (r.error) throw r.error;
      let rows = ((r.data as { rows: Row[]; total: number })?.rows ?? []) as Row[];
      // the directory pages at 500; fetch the rest
      const total = (r.data as { total: number })?.total ?? rows.length;
      for (let off = 500; off < Math.min(total, 50000); off += 500) {
        const more = await supabase.rpc("customer_directory", { p: { q: f.q ?? "", region: f.region ?? "", tag: f.tag ?? "", source: f.source ?? "", limit: 500, offset: off } });
        rows = rows.concat(((more.data as { rows: Row[] })?.rows ?? []) as Row[]);
      }
      return {
        title: "Customers", rows, columns: [
          { header: "Name", value: (c) => s(c.name) }, { header: "Phone", value: (c) => s(c.phone) }, { header: "Email", value: (c) => s(c.email) }, { header: "Region", value: (c) => s(c.region) },
          { header: "Source", value: (c) => s(c.source) }, { header: "Tags", value: (c) => ((c.tags as string[]) ?? []).join("; ") }, { header: "Marketing consent", value: (c) => (c.consent ? "yes" : "no") },
          { header: "Orders", value: (c) => c.orders as number }, { header: "Spend (GHS)", value: (c) => ghs(c.spend) }, { header: "Balance (GHS)", value: (c) => ghs(c.balance) },
          { header: "Last order", value: (c) => s(c.last_order) }, { header: "Customer since", value: (c) => s(c.since) },
        ],
      };
    }
    case "money": {
      let q = supabase.from("money_ledger").select("at, direction, category, amount, branch, method, label").order("at", { ascending: false }).limit(50000);
      if (f.month && /^\d{4}-\d{2}$/.test(f.month)) {
        const [y, m] = f.month.split("-").map(Number);
        q = q.gte("at", `${f.month}-01`).lt("at", new Date(Date.UTC(y, m, 1)).toISOString());
      } else {
        if (isDate(f.from)) q = q.gte("at", f.from!);
        if (isDate(f.to)) q = q.lt("at", new Date(new Date(f.to!).getTime() + 86_400_000).toISOString());
      }
      const r = await q;
      if (r.error) throw r.error;
      return {
        title: "Money in and out", rows: (r.data ?? []) as Row[], columns: [
          { header: "When", value: (m) => s(m.at) }, { header: "In/out", value: (m) => s(m.direction) }, { header: "Category", value: (m) => s(m.category) },
          { header: "Amount (GHS)", value: (m) => ghs(m.amount) }, { header: "Branch", value: (m) => s(m.branch) }, { header: "Method", value: (m) => s(m.method) }, { header: "Detail", value: (m) => s(m.label) },
        ],
      };
    }
    case "catalogue": {
      const r = await supabase.from("variants").select("sku, style, colour, size, price, compare_at, sale_price, availability, lead_days, last_checked_at, product:products(name, brand, published)").order("sku").limit(50000);
      if (r.error) throw r.error;
      return {
        title: "Catalogue", rows: (r.data ?? []) as Row[], columns: [
          { header: "SKU", value: (v) => s(v.sku) }, { header: "Product", value: (v) => one(v.product as { name: string })?.name }, { header: "Brand", value: (v) => one(v.product as { brand: string })?.brand },
          { header: "Style", value: (v) => s(v.style) }, { header: "Colour", value: (v) => s(v.colour) }, { header: "Size", value: (v) => s(v.size) },
          { header: "Price (GHS)", value: (v) => ghs(v.price) }, { header: "Compare at (GHS)", value: (v) => ghs(v.compare_at) }, { header: "Sale price (GHS)", value: (v) => ghs(v.sale_price) },
          { header: "Availability", value: (v) => s(v.availability) }, { header: "Lead days", value: (v) => v.lead_days as number }, { header: "Last checked", value: (v) => s(v.last_checked_at) },
          { header: "Live", value: (v) => (one(v.product as { published: boolean })?.published ? "yes" : "no") },
        ],
      };
    }
    case "suppliers": {
      const r = await supabase.from("suppliers").select("name, phone, whatsapp, notes, active, created_at").order("name");
      if (r.error) throw r.error;
      return {
        title: "Suppliers", rows: (r.data ?? []) as Row[], columns: [
          { header: "Name", value: (x) => s(x.name) }, { header: "Phone", value: (x) => s(x.phone) }, { header: "WhatsApp", value: (x) => s(x.whatsapp) },
          { header: "Active", value: (x) => (x.active ? "yes" : "no") }, { header: "Notes", value: (x) => s(x.notes) },
        ],
      };
    }
    case "expenses": {
      let q = supabase.from("expenses").select("spent_on, category, amount, branch, method, note, campaign, created_by_name").order("spent_on", { ascending: false }).limit(50000);
      if (isDate(f.from)) q = q.gte("spent_on", f.from!);
      if (isDate(f.to)) q = q.lte("spent_on", f.to!);
      const r = await q;
      if (r.error) throw r.error;
      return {
        title: "Expenses", rows: (r.data ?? []) as Row[], columns: [
          { header: "Date", value: (e) => s(e.spent_on) }, { header: "Category", value: (e) => s(e.category) }, { header: "Amount (GHS)", value: (e) => ghs(e.amount) },
          { header: "Branch", value: (e) => s(e.branch) }, { header: "Method", value: (e) => s(e.method) }, { header: "Campaign", value: (e) => s(e.campaign) },
          { header: "Note", value: (e) => s(e.note) }, { header: "Recorded by", value: (e) => s(e.created_by_name) },
        ],
      };
    }
    case "targets": {
      const r = await supabase.rpc("target_progress", { p_date: new Date().toISOString().slice(0, 10) });
      if (r.error) throw r.error;
      return {
        title: "Targets and progress", rows: (r.data ?? []) as Row[], columns: [
          { header: "Who", value: (t) => s(t.staff) }, { header: "Measure", value: (t) => s(t.label ?? t.metric) }, { header: "Goal", value: (t) => Number(t.goal) },
          { header: "Actual", value: (t) => Number(t.actual) }, { header: "From", value: (t) => s(t.from) }, { header: "To", value: (t) => s(t.to) },
          { header: "Weight", value: (t) => Number(t.weight ?? 1) }, { header: "Status", value: (t) => s(t.status) },
        ],
      };
    }
    case "reviews": {
      const r = await supabase.from("reviews").select("created_at, rating, title, body, display_name, source, verified, consent, status, product:products(name)").order("created_at", { ascending: false }).limit(50000);
      if (r.error) throw r.error;
      return {
        title: "Reviews", rows: (r.data ?? []) as Row[], columns: [
          { header: "When", value: (x) => s(x.created_at) }, { header: "Product", value: (x) => one(x.product as { name: string })?.name }, { header: "Rating", value: (x) => x.rating as number },
          { header: "Title", value: (x) => s(x.title) }, { header: "Review", value: (x) => s(x.body) }, { header: "Name", value: (x) => s(x.display_name) },
          { header: "Source", value: (x) => s(x.source) }, { header: "Verified", value: (x) => (x.verified ? "yes" : "no") }, { header: "Consent", value: (x) => (x.consent ? "yes" : "no") }, { header: "Status", value: (x) => s(x.status) },
        ],
      };
    }
    case "subscribers": {
      const r = await supabase.from("newsletter_subscribers").select("email, placement, consent_at, unsubscribed_at").order("consent_at", { ascending: false }).limit(50000);
      if (r.error) throw r.error;
      return {
        title: "Newsletter subscribers", rows: (r.data ?? []) as Row[], columns: [
          { header: "Email", value: (x) => s(x.email) }, { header: "Signed up from", value: (x) => s(x.placement) }, { header: "Consent", value: (x) => s(x.consent_at) }, { header: "Unsubscribed", value: (x) => s(x.unsubscribed_at) },
        ],
      };
    }
    case "analytics": {
      const to = isDate(f.to) ? f.to! : new Date().toISOString().slice(0, 10);
      const from = isDate(f.from) ? f.from! : new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
      const r = await supabase.rpc("kpi_report", { p_from: from, p_to: to });
      if (r.error) throw r.error;
      const d = r.data as { current: Record<string, unknown>; previous: Record<string, unknown> };
      const rows = Object.keys(d.current).map((k) => ({ kpi: k.replace(/_/g, " "), current: d.current[k], previous: d.previous[k] }));
      return {
        title: `KPI summary ${from} to ${to}`, rows, columns: [
          { header: "KPI", value: (x) => s(x.kpi) }, { header: "This period", value: (x) => (x.current === null ? null : Number(x.current)) }, { header: "Previous period", value: (x) => (x.previous === null ? null : Number(x.previous)) },
        ],
      };
    }
    case "feedback": {
      const r = await supabase.from("site_feedback").select("created_at, page, rating, message").order("created_at", { ascending: false }).limit(50000);
      if (r.error) throw r.error;
      return {
        title: "Site feedback", rows: (r.data ?? []) as Row[], columns: [
          { header: "When", value: (x) => s(x.created_at) }, { header: "Page", value: (x) => s(x.page) }, { header: "Rating", value: (x) => (x.rating as number) ?? null }, { header: "Message", value: (x) => s(x.message) },
        ],
      };
    }
  }
}
