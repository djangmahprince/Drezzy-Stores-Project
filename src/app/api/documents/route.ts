import { getStaffState } from "@/lib/auth";
import { siteUrl } from "@/lib/notify/send";
import { labelPdf, packingSlipPdf, receiptPdf } from "@/lib/pdf/docs";
import { staffOrderDoc } from "@/lib/pdf/order-data";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** Staff documents for an order: receipt, packing slip, delivery label with QR (PRD FR-ORD-008). */
export async function GET(request: Request) {
  if (!isSupabaseConfigured) return new Response("Connect Supabase first", { status: 503 });
  const state = await getStaffState();
  if (state.status !== "ok" || !can(state.staff.permissions, "orders", "view")) return new Response("Not allowed", { status: 403 });
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("order") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id) || !["receipt", "slip", "label"].includes(kind ?? "")) return new Response("Choose an order and a document", { status: 400 });

  const order = await staffOrderDoc(await createClient(), id);
  if (!order) return new Response("Order not found", { status: 404 });
  const site = siteUrl();
  const pdf = kind === "receipt" ? await receiptPdf(order, site) : kind === "slip" ? await packingSlipPdf(order) : await labelPdf(order, `${site}/dashboard/orders/${id}`);
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${order.number}-${kind}.pdf"`, "Cache-Control": "no-store" },
  });
}
