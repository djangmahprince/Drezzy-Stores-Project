import { siteUrl } from "@/lib/notify/send";
import { receiptPdf } from "@/lib/pdf/docs";
import { trackedOrderDoc } from "@/lib/pdf/order-data";
import { limited } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * A customer's invoice as PDF (FR-ACC-006). Guests prove it is theirs with the order number and phone, exactly like the
 * tracking page; a signed-in shopper only needs the number of one of their own orders.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured) return new Response("Invoices are available once the shop is connected", { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited("invoice", ip, 20, 60_000)) return new Response("Too many requests", { status: 429 });
  const url = new URL(request.url);
  const number = (url.searchParams.get("number") ?? "").trim().toUpperCase();
  let phone = (url.searchParams.get("phone") ?? "").trim();
  if (!/^DRZ-\d+$/.test(number)) return new Response("Enter the order number", { status: 400 });

  const supabase = await createClient();
  if (!phone) {
    const { data } = await supabase.rpc("my_orders");
    phone = ((data ?? []) as { number: string; phone: string }[]).find((o) => o.number === number)?.phone ?? "";
  }
  if (!phone) return new Response("Sign in, or add your phone number", { status: 403 });
  const { data: tracked } = await supabase.rpc("track_order", { p_number: number, p_phone: phone });
  if (!tracked) return new Response("We could not find that order", { status: 404 });

  const pdf = await receiptPdf(trackedOrderDoc(tracked, phone), siteUrl(), "Invoice");
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${number}-invoice.pdf"`, "Cache-Control": "private, no-store" },
  });
}
