import "server-only";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type OrderExtras = {
  orderId: string;
  status: string;
  balance: number;
  outcome: string | null;
  failedItems: number;
  riderId: string | null;
  riders: { id: string; name: string; kind: string; company: string | null }[];
  agents: { id: string; name: string }[];
  agentId: string | null;
  threads: { id: string; subject: string; status: string; messages: { from_staff: boolean; author_name: string; body: string; at: string }[] }[];
  codeRequired: boolean;
  rights: { full: boolean; admin: boolean; source: boolean; reply: boolean; edit: boolean };
};

/** What the order page needs beyond the order itself: riders, people to reassign to, and the customer's messages. */
export async function getOrderExtras(numberOrId: string): Promise<OrderExtras | null> {
  const me = await requireStaff();
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const byId = /^[0-9a-f-]{36}$/i.test(numberOrId);
  const { data: o } = await supabase.from("orders").select("id, status, balance_due, sourcing_outcome, rider_id, assigned_agent_id, items:order_items(sourcing)")
    .eq(byId ? "id" : "number", byId ? numberOrId : numberOrId.toUpperCase()).maybeSingle();
  if (!o) return null;
  const p = me.permissions;
  const full = can(p, "orders", "edit") && p.orders?.scope === "all";
  const admin = can(p, "orders", "delete");
  const reply = can(p, "customers", "edit") && p.customers?.scope === "all";
  const [riders, agents, threads, setting] = await Promise.all([
    full ? supabase.from("riders").select("id, name, kind, company").eq("active", true).order("name") : Promise.resolve({ data: [] }),
    admin ? supabase.from("staff").select("id, full_name").eq("active", true).order("full_name") : Promise.resolve({ data: [] }),
    reply ? supabase.from("support_threads").select("id, subject, status, messages:support_messages(from_staff, author_name, body, at)").eq("order_id", o.id).order("last_message_at", { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from("app_settings").select("value").eq("key", "delivery").maybeSingle(),
  ]);
  return {
    orderId: o.id, status: o.status, balance: Number(o.balance_due), outcome: o.sourcing_outcome,
    failedItems: ((o.items as { sourcing: string }[]) ?? []).filter((i) => i.sourcing === "failed").length,
    riderId: o.rider_id, agentId: o.assigned_agent_id,
    riders: (riders.data ?? []) as OrderExtras["riders"],
    agents: ((agents.data ?? []) as { id: string; full_name: string }[]).map((a) => ({ id: a.id, name: a.full_name })),
    threads: ((threads.data ?? []) as OrderExtras["threads"]).map((t) => ({ ...t, messages: [...t.messages].sort((a, b) => a.at.localeCompare(b.at)) })),
    codeRequired: !!(setting.data?.value as { require_delivery_code?: boolean } | undefined)?.require_delivery_code,
    rights: { full, admin, source: can(p, "availability", "edit"), reply, edit: can(p, "orders", "edit") },
  };
}
