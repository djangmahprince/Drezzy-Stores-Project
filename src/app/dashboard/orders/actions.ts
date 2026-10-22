"use server";

import { requireStaff } from "@/lib/auth";
import { statusToDb, type Status } from "@/lib/orders/dash-types";
import { staffPayload } from "@/lib/orders/payload";
import type { StaffOrderInput } from "@/lib/orders/types";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };
const done: ActionResult = { ok: true };

/**
 * The database functions raise plain-English messages for rule breaks ("Record the balance collected first").
 * Those are shown as they are. Raw database or permission errors are not.
 */
function say(e: { code?: string; message: string }): ActionResult {
  const friendly = e.code === "P0001" || (e.code === "42501" && !/^(permission denied|new row violates|row-level security)/i.test(e.message));
  return { ok: false, error: friendly ? e.message : "You cannot do that, or something went wrong. Please try again." };
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Connect Supabase first." };
  await requireStaff();
  const { error } = await createClient().then((c) => c.rpc(fn, args));
  return error ? say(error) : done;
}

export async function advanceOrderAction(orderId: string, to: Status, note?: string): Promise<ActionResult> {
  return rpc("advance_order", { p_order: orderId, p_to: statusToDb(to), p_note: note?.trim() || null });
}

export async function moveBackAction(orderId: string, to: Status, reason: string): Promise<ActionResult> {
  return rpc("move_order_back", { p_order: orderId, p_to: statusToDb(to), p_reason: reason });
}

export async function recordBalanceAction(orderId: string, method: "momo" | "cash", reference?: string): Promise<ActionResult> {
  return rpc("record_balance", { p_order: orderId, p_method: method, p_reference: reference?.trim() || null });
}

export async function recordPaymentAction(orderId: string, method: "momo" | "cash", reference?: string): Promise<ActionResult> {
  return rpc("record_checkout_payment", { p_order: orderId, p_method: method, p_reference: reference?.trim() || null });
}

export async function reviewPaymentAction(paymentId: string, approve: boolean): Promise<ActionResult> {
  return rpc("review_manual_payment", { p_payment: paymentId, p_approve: approve });
}

export async function placeSupplierOrderAction(a: { orderId: string; supplierId: string; itemIds: string[]; cost: number; expected?: string; note?: string }): Promise<ActionResult> {
  if (!Number.isFinite(a.cost) || a.cost < 0) return { ok: false, error: "Enter the agreed cost." };
  return rpc("place_supplier_order", { p_order: a.orderId, p_supplier: a.supplierId, p_items: a.itemIds, p_cost: a.cost, p_expected: a.expected || null, p_note: a.note?.trim() || null });
}

export async function receiveSupplierOrderAction(id: string): Promise<ActionResult> {
  return rpc("receive_supplier_order", { p_supplier_order: id, p_receipt: null });
}

const RECEIPT_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Checks a chosen receipt and uploads it to the private bucket. Returns the stored path, or a plain-English problem. */
async function uploadReceipt(supplierOrderId: string, file: File): Promise<{ path: string } | { error: string }> {
  const ext = RECEIPT_TYPES[file.type];
  if (!ext) return { error: "Choose a photo (JPG, PNG, WebP) or a PDF." };
  if (file.size > 5 * 1024 * 1024) return { error: "That file is over 5 MB. Choose a smaller photo." };
  const path = `${supplierOrderId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await (await createClient()).storage.from("receipts").upload(path, file, { contentType: file.type, upsert: false });
  return error ? { error: "The receipt could not be uploaded. Please try again." } : { path };
}

/** Marks a supplier order received, with the receipt photo if one was chosen. The file goes up first so a failed upload leaves the order untouched. */
export async function receiveSupplierOrderWithReceiptAction(fd: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Connect Supabase first." };
  await requireStaff();
  const id = String(fd.get("id") ?? "");
  const file = fd.get("receipt");
  let path: string | null = null;
  if (file instanceof File && file.size > 0) {
    const up = await uploadReceipt(id, file);
    if ("error" in up) return { ok: false, error: up.error };
    path = up.path;
  }
  const { error } = await (await createClient()).rpc("receive_supplier_order", { p_supplier_order: id, p_receipt: path });
  return error ? say(error) : done;
}

export async function attachReceiptAction(fd: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Connect Supabase first." };
  await requireStaff();
  const id = String(fd.get("id") ?? "");
  const file = fd.get("receipt");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a receipt first." };
  const up = await uploadReceipt(id, file);
  if ("error" in up) return { ok: false, error: up.error };
  const { error } = await (await createClient()).rpc("attach_receipt", { p_supplier_order: id, p_path: up.path });
  return error ? say(error) : done;
}

/** A link to the receipt that works for one minute. Only people who may see supplier costs get one. */
export async function receiptLinkAction(id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("supplier_orders").select("receipt_path").eq("id", id).maybeSingle();
  if (!data?.receipt_path) return { ok: false, error: "There is no receipt for this supplier order." };
  const signed = await supabase.storage.from("receipts").createSignedUrl(data.receipt_path as string, 60);
  return signed.data?.signedUrl ? { ok: true, url: signed.data.signedUrl } : { ok: false, error: "You cannot open this receipt." };
}

export async function failSupplierOrderAction(id: string, reason: string): Promise<ActionResult> {
  return rpc("fail_supplier_order", { p_supplier_order: id, p_reason: reason });
}

export async function requestRefundAction(orderId: string, amount: number, reason: string): Promise<ActionResult> {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount above zero." };
  return rpc("request_refund", { p_order: orderId, p_amount: amount, p_reason: reason.trim() });
}

export async function reviewRefundAction(refundId: string, approve: boolean, note?: string): Promise<ActionResult> {
  return rpc("review_refund", { p_refund: refundId, p_approve: approve, p_note: note?.trim() || null });
}

export async function payRefundAction(refundId: string, method: "momo" | "cash", reference?: string): Promise<ActionResult> {
  return rpc("pay_refund", { p_refund: refundId, p_method: method, p_reference: reference?.trim() || null });
}

export async function addNoteAction(orderId: string, body: string): Promise<ActionResult> {
  const me = await requireStaff();
  if (!isSupabaseConfigured) return { ok: false, error: "Connect Supabase first." };
  const text = body.trim();
  if (!text || text.length > 2000) return { ok: false, error: "Write a note up to 2,000 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("order_notes").insert({ order_id: orderId, author_id: me.id, author_name: me.fullName, body: text });
  return error ? say(error) : done;
}

/** Courier, tracking number and rider. These are plain fields; row-level security decides who may edit them. */
export async function updateDeliveryAction(orderId: string, d: { courier: string; tracking: string; riderName: string; riderPhone: string }): Promise<ActionResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "orders", "edit")) return { ok: false, error: "You cannot change this order." };
  if (!isSupabaseConfigured) return { ok: false, error: "Connect Supabase first." };
  const clean = (v: string) => v.trim().slice(0, 80) || null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ courier: clean(d.courier), tracking_number: clean(d.tracking), rider_name: clean(d.riderName), rider_phone: clean(d.riderPhone) })
    .eq("id", orderId)
    .select("id")
    .maybeSingle();
  if (error) return say(error);
  return data ? done : { ok: false, error: "You are not allowed to change this order." };
}

/** Staff capture a WhatsApp, phone or walk-in sale. The same database function prices it, so staff cannot mis-price an order either. */
export async function createStaffOrderAction(input: StaffOrderInput): Promise<{ ok: true; number: string; id: string; total: number; dueNow: number } | { ok: false; error: string }> {
  const me = await requireStaff();
  if (!can(me.permissions, "orders", "create")) return { ok: false, error: "You cannot create orders." };
  if (!isSupabaseConfigured) return { ok: false, error: "Connect Supabase first." };

  const { data, error } = await (await createClient()).rpc("place_order", { p: staffPayload(input) });
  if (error || !data) {
    const r = say(error ?? { message: "" });
    return { ok: false, error: r.ok ? "Could not create the order." : r.error };
  }
  const r = data as { order_id: string; number: string; total: number; due_now: number };
  return { ok: true, number: r.number, id: r.order_id, total: Number(r.total), dueNow: Number(r.due_now) };
}
