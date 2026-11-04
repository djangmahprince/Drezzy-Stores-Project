"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PartnerResult = { ok: true } | { ok: false; error: string };

/** The database checks that the job is this partner's and that the step is allowed. Its messages are written for people. */
export async function partnerUpdateAction(orderId: string, action: "out_for_delivery" | "failed" | "collect" | "delivered", d: { code?: string; method?: "cash" | "momo"; reference?: string; note?: string } = {}): Promise<PartnerResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("partner_update", { p_order: orderId, p_action: action, p_code: d.code ?? null, p_method: d.method ?? null, p_reference: d.reference ?? null, p_note: d.note ?? null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner");
  return { ok: true };
}
