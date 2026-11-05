import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { REVIEWS_TAG, SITE_TAG } from "@/lib/catalogue/tags";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public";
import type { Tone } from "@/lib/catalogue/types";

/**
 * What the Content Editor and Admins control without a developer (PRD section 19): contact details, the announcement bar,
 * the order of the home page sections, banners, looks, collections, static pages and the glossary. Cached and shared by all
 * shoppers; every content save calls updateTag(SITE_TAG), so changes appear straight away.
 */

export type SiteSettings = {
  accra: { call: string; whatsapp: string };
  kumasi: { call: string; whatsapp: string };
  hours: string;
  /** The company delivery line, per branch. Empty falls back to the branch number. */
  logistics?: { accra?: string; kumasi?: string; hours?: string };
  socials: { instagram?: string; tiktok?: string; snapchat?: string; facebook?: string };
  promise: string;
};
export type HomeSection = { id: string; kind: string; title: string | null; config: Record<string, unknown>; sort: number };
export type Banner = { id: string; placement: "hero" | "promo"; title: string; subtitle: string | null; cta_label: string | null; cta_href: string | null; image_desktop: string | null; image_mobile: string | null; tone: Tone };
export type Look = { slug: string; title: string; intro: string | null; occasion: string | null; image: string | null; tone: Tone; items: { slug: string; style?: string; alternatives?: string[] }[] };
export type Collection = { slug: string; title: string; description: string | null; kind: "manual" | "rule"; product_slugs: string[]; rule: Record<string, unknown>; image: string | null; seo_title: string | null; seo_description: string | null };
export type SitePage = { slug: string; title: string; body: string; seo_title: string | null; seo_description: string | null; updated_at: string };
export type Term = { slug: string; term: string; definition: string };
export type ReviewCard = { rating: number; body: string; name: string; city: string | null; source: string; product: string | null; slug: string | null };

export const defaultSettings: SiteSettings = {
  accra: { call: "054 899 6648", whatsapp: "050 131 5862" },
  kumasi: { call: "055 355 7347", whatsapp: "055 355 7347" },
  hours: "Monday to Saturday, 8am to 8pm",
  socials: { instagram: "https://instagram.com/drezzy_stores", tiktok: "https://tiktok.com/@drezzy.stores", snapchat: "https://snapchat.com/add/drezzystores" },
  promise: "Nationwide delivery from our Accra and Kumasi branches",
};

const defaultSections: HomeSection[] = ["hero", "categories", "new", "picked", "best", "drops", "looks", "drip", "reviews", "promise"].map((kind, i) => ({
  id: kind, kind, title: null, config: {}, sort: i + 1,
}));

const defaultTerms: Term[] = [
  { slug: "og", term: "OG", definition: 'Short for "original". The first colourway a shoe was released in, often the most wanted.' },
  { slug: "retro", term: "Retro", definition: "A re-release of a classic model, made to look like the original from years ago." },
  { slug: "colourway", term: "Colourway", definition: 'The colour combination of a shoe or outfit, for example "Panda" is black and white.' },
  { slug: "gs-sizing", term: "GS sizing", definition: "Grade School sizes: smaller sizes made for older kids that many adults with small feet wear too." },
  { slug: "quarter-zip", term: "Quarter-zip", definition: "A pullover top with a short zip at the neck, a smart-casual favourite." },
  { slug: "deadstock", term: "Deadstock", definition: "Brand new and never worn, in the original box. Every Drezzy item is brand new." },
];

export type SiteContent = {
  settings: SiteSettings;
  announcements: { text: string; href: string | null }[];
  sections: HomeSection[];
  banners: Banner[];
  looks: Look[];
  collections: Collection[];
};

export async function getSiteContent(): Promise<SiteContent> {
  "use cache";
  cacheTag(SITE_TAG);
  cacheLife("minutes");
  const fallback: SiteContent = { settings: defaultSettings, announcements: [{ text: defaultSettings.promise, href: null }], sections: defaultSections, banners: [], looks: [], collections: [] };
  if (!isSupabaseConfigured) return fallback;
  const db = createPublicClient();
  const [s, a, h, b, l, c] = await Promise.all([
    db.from("site_settings").select("data").maybeSingle(),
    db.from("announcements").select("text, href").order("sort"),
    db.from("home_sections").select("id, kind, title, config, sort").order("sort"),
    db.from("banners").select("id, placement, title, subtitle, cta_label, cta_href, image_desktop, image_mobile, tone").order("sort"),
    db.from("looks").select("slug, title, intro, occasion, image, tone, items").order("sort"),
    db.from("collections").select("slug, title, description, kind, product_slugs, rule, image, seo_title, seo_description").order("sort"),
  ]);
  if (s.error || h.error) throw new Error("Could not load the site content");
  const settings = { ...defaultSettings, ...((s.data?.data as Partial<SiteSettings>) ?? {}) };
  return {
    settings,
    announcements: a.data?.length ? (a.data as SiteContent["announcements"]) : [{ text: settings.promise, href: null }],
    sections: (h.data as HomeSection[])?.length ? (h.data as HomeSection[]) : defaultSections,
    banners: (b.data ?? []) as Banner[],
    looks: (l.data ?? []) as Look[],
    collections: (c.data ?? []) as Collection[],
  };
}

/** A static page written in the dashboard (About, FAQ, Terms...). Null means: use the page built into the shop. */
export async function getPage(slug: string): Promise<SitePage | null> {
  "use cache";
  cacheTag(SITE_TAG);
  cacheLife("minutes");
  if (!isSupabaseConfigured) return null;
  const { data } = await createPublicClient().from("pages").select("slug, title, body, seo_title, seo_description, updated_at").eq("slug", slug).maybeSingle();
  return (data as SitePage) ?? null;
}

export async function getPageSlugs(): Promise<string[]> {
  "use cache";
  cacheTag(SITE_TAG);
  cacheLife("minutes");
  if (!isSupabaseConfigured) return [];
  const { data } = await createPublicClient().from("pages").select("slug");
  return (data ?? []).map((p: { slug: string }) => p.slug);
}

export async function getGlossary(): Promise<Term[]> {
  "use cache";
  cacheTag(SITE_TAG);
  cacheLife("hours");
  if (!isSupabaseConfigured) return defaultTerms;
  const { data } = await createPublicClient().from("glossary_terms").select("slug, term, definition").order("sort");
  return data?.length ? (data as Term[]) : defaultTerms;
}

export async function getRecentReviews(): Promise<ReviewCard[]> {
  "use cache";
  cacheTag(REVIEWS_TAG);
  cacheLife("minutes");
  if (!isSupabaseConfigured) return [];
  const { data } = await createPublicClient().rpc("recent_reviews", { p_limit: 8 });
  return (data ?? []) as ReviewCard[];
}

export type ProductReviews = { average: number | null; count: number; reviews: { rating: number; title: string | null; body: string; name: string; city: string | null; verified: boolean; source: string; photos: string[]; at: string }[] };

export async function getProductReviews(slug: string): Promise<ProductReviews> {
  "use cache";
  cacheTag(REVIEWS_TAG);
  cacheLife("minutes");
  if (!isSupabaseConfigured) return { average: null, count: 0, reviews: [] };
  const { data } = await createPublicClient().rpc("product_reviews", { p_slug: slug });
  const d = (data ?? { average: null, count: 0, reviews: [] }) as ProductReviews;
  return { ...d, count: Number(d.count), average: d.average === null ? null : Number(d.average) };
}

export async function getAlsoBought(slug: string): Promise<string[]> {
  "use cache";
  cacheTag(REVIEWS_TAG);
  cacheLife("hours");
  if (!isSupabaseConfigured) return [];
  const { data } = await createPublicClient().rpc("also_bought", { p_slug: slug, p_limit: 4 });
  return (data ?? []) as string[];
}

export { publicFile } from "@/lib/media";
