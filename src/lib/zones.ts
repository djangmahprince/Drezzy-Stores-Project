import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { zones as defaultZones, type Zone } from "@/lib/data";
import { ZONES_TAG } from "@/lib/catalogue/tags";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public";

/** Active delivery zones for the storefront and staff order form. Cached; saving a zone calls updateTag(ZONES_TAG). */
export async function getZones(): Promise<Zone[]> {
  "use cache";
  cacheTag(ZONES_TAG);
  cacheLife("minutes");
  if (!isSupabaseConfigured) return defaultZones;
  const { data, error } = await createPublicClient().from("delivery_zones").select("region, fee, est_days, half_payment_allowed").eq("active", true).order("sort");
  if (error) throw new Error(`Could not load delivery zones: ${error.message}`);
  return (data ?? []).map((z) => ({ region: z.region as string, fee: Number(z.fee), days: z.est_days as number, accra: z.half_payment_allowed as boolean }));
}
