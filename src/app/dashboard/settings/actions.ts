"use server";

import { updateTag } from "next/cache";
import { requireAction } from "@/lib/auth";
import { ZONES_TAG } from "@/lib/catalogue/tags";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ZoneInput = { region: string; fee: number; days: number; half: boolean; active: boolean };
export type ZoneResult = { ok: true } | { ok: false; error: string };

/** Changes what the shop charges and promises for a region. Row-level security also requires the settings permission. */
export async function saveZoneAction(z: ZoneInput): Promise<ZoneResult> {
  try {
    await requireAction("settings", "edit");
  } catch {
    return { ok: false, error: "You do not have permission to change delivery zones." };
  }
  if (!isSupabaseConfigured) return { ok: false, error: "Connect Supabase first." };
  if (!Number.isFinite(z.fee) || z.fee < 0 || z.fee > 1000) return { ok: false, error: "Enter a fee between GHS 0 and 1,000." };
  if (!Number.isInteger(z.days) || z.days < 0 || z.days > 30) return { ok: false, error: "Delivery days must be a whole number from 0 to 30." };
  const { data, error } = await (await createClient())
    .from("delivery_zones")
    .update({ fee: Math.round(z.fee * 100) / 100, est_days: z.days, half_payment_allowed: z.half, active: z.active, updated_at: new Date().toISOString() })
    .eq("region", z.region)
    .select("region");
  if (error || !data?.length) return { ok: false, error: "Could not save. Please try again." };
  updateTag(ZONES_TAG);
  return { ok: true };
}
