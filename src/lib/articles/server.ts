import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { ARTICLES_TAG } from "@/lib/catalogue/tags";
import { articles as starter } from "@/lib/data";
import type { ArtKind, Tone } from "@/lib/catalogue/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public";

export type Article = {
  slug: string; type: string; minutes: number; title: string; intro: string; body: string | null; tone: Tone; kind: ArtKind;
  author_name?: string | null; publish_at?: string | null; tags?: string[]; featured?: boolean;
  seo_title?: string | null; seo_description?: string | null; hero_image?: string | null; share_image?: string | null;
};

/**
 * Published Drip School articles, newest first. Cached; saving an article calls updateTag(ARTICLES_TAG).
 * Without Supabase, or before any article is published, the built-in starter articles are shown so the section is never empty.
 */
export async function getArticles(): Promise<Article[]> {
  "use cache";
  cacheTag(ARTICLES_TAG);
  cacheLife("minutes");
  const fallback = starter.map((a) => ({ ...a, body: null }));
  if (!isSupabaseConfigured) return fallback;
  const { data, error } = await createPublicClient()
    .from("articles")
    .select("slug, type, minutes, title, intro, body, tone, kind, author_name, publish_at, tags, featured, seo_title, seo_description, hero_image, share_image")
    .eq("status", "published")
    .lte("publish_at", new Date().toISOString())
    .order("publish_at", { ascending: false });
  if (error) throw new Error(`Could not load articles: ${error.message}`);
  return data && data.length > 0 ? (data as Article[]) : fallback;
}
