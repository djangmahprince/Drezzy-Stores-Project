import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PUBLIC_PRODUCT_SELECT, productFromRow, type ProductRow } from "@/lib/catalogue/map";
import { sampleProducts } from "@/lib/catalogue/sample";
import { CATALOGUE_TAG } from "@/lib/catalogue/tags";
import type { Product } from "@/lib/catalogue/types";

/**
 * The storefront catalogue: published products with their variants.
 * Cached and shared by all shoppers. Staff changes call updateTag(CATALOGUE_TAG), so they show up straight away.
 * Without Supabase it is the sample catalogue, so the storefront still works while the database is being set up.
 */
export async function getCatalogue(): Promise<Product[]> {
  "use cache";
  cacheTag(CATALOGUE_TAG);
  cacheLife("minutes"); // staff edits call updateTag, so changes still show immediately

  if (!isSupabaseConfigured) return sampleProducts;

  const { data, error } = await createPublicClient().from("products").select(PUBLIC_PRODUCT_SELECT).eq("published", true);
  if (error) {
    // Throwing keeps a failed read out of the cache; the next request tries again.
    throw new Error(`Could not load the catalogue: ${error.message}`);
  }
  return (data as unknown as ProductRow[]).map(productFromRow).filter((p) => p.variants.length > 0);
}

/**
 * What shoppers browse. A product with no size available drops off the shop by itself, as soon as staff flag it. Its page
 * still opens from an old link or a past order, and says it is unavailable, with Notify me.
 */
export async function getListedCatalogue(): Promise<Product[]> {
  return (await getCatalogue()).filter((p) => p.variants.some((v) => v.availability !== "Unavailable"));
}
