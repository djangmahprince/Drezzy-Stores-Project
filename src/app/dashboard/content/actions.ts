"use server";

import { updateTag } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { ARTICLES_TAG, REVIEWS_TAG, SITE_TAG } from "@/lib/catalogue/tags";
import { readingMinutes } from "@/lib/articles/format";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ArticleInput = {
  id?: string; slug: string; title: string; type: string; intro: string; body: string; tone: string; kind: string;
  status: "draft" | "in_review" | "published"; publishAt: string | null;
  tags?: string; featured?: boolean; seoTitle?: string; seoDescription?: string; heroImage?: string; shareImage?: string;
};
export type ArticleResult = { ok: true; id: string } | { ok: false; error: string };

const types = ["Outfit guide", "How-to", "Trends", "Occasion lookbook", "Drop news", "Customer spotlight", "Gift guide"];
const tones = ["navy", "grey", "blue", "red", "charcoal"];
const kinds = ["sneaker", "apparel", "watch", "slide", "cap"];

export async function saveArticleAction(a: ArticleInput): Promise<ArticleResult> {
  const me = await requireStaff();
  if (!can(me.permissions, "content", a.id ? "edit" : "create")) return { ok: false, error: "You cannot edit articles." };
  if (!isSupabaseConfigured) return { ok: false, error: "Connect Supabase first." };
  const title = a.title.trim();
  const intro = a.intro.trim();
  if (title.length < 3 || title.length > 140) return { ok: false, error: "Give the article a title (3 to 140 characters)." };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug) || a.slug.length > 80) return { ok: false, error: "The web address can only use lower-case letters, numbers and dashes." };
  if (intro.length < 10 || intro.length > 600) return { ok: false, error: "Write an introduction of 10 to 600 characters." };
  if (a.body.length > 20000) return { ok: false, error: "The article is too long (20,000 characters at most)." };
  if (!types.includes(a.type) || !tones.includes(a.tone) || !kinds.includes(a.kind)) return { ok: false, error: "Choose a type, colour and picture." };
  let publishAt: string | null = null;
  if (a.status === "published") {
    const t = a.publishAt ? new Date(a.publishAt) : new Date();
    if (Number.isNaN(t.getTime())) return { ok: false, error: "Choose a valid publish time." };
    publishAt = t.toISOString();
  }
  if ((a.seoTitle ?? "").length > 70 || (a.seoDescription ?? "").length > 170) return { ok: false, error: "Keep the SEO title under 70 and the description under 170 characters." };
  const row = {
    slug: a.slug, title, type: a.type, intro, body: a.body.trim() || null, tone: a.tone, kind: a.kind, status: a.status, publish_at: publishAt, minutes: Math.min(60, readingMinutes(intro, a.body)),
    tags: (a.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12), featured: !!a.featured,
    seo_title: a.seoTitle?.trim() || null, seo_description: a.seoDescription?.trim() || null, hero_image: a.heroImage?.trim() || null, share_image: a.shareImage?.trim() || null,
  };
  const supabase = await createClient();
  if (a.id) {
    const { error } = await supabase.from("articles").update(row).eq("id", a.id);
    if (error) return { ok: false, error: error.code === "23505" ? "Another article already uses that web address." : "Could not save. Please try again." };
    updateTag(ARTICLES_TAG);
    return { ok: true, id: a.id };
  }
  const { data, error } = await supabase.from("articles").insert({ ...row, author_id: me.id, author_name: me.fullName }).select("id").single();
  if (error || !data) return { ok: false, error: error?.code === "23505" ? "Another article already uses that web address." : "Could not save. Please try again." };
  updateTag(ARTICLES_TAG);
  return { ok: true, id: data.id as string };
}

export async function deleteArticleAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireStaff();
  if (!can(me.permissions, "content", "delete")) return { ok: false, error: "You cannot delete articles." };
  const { error, data } = await (await createClient()).from("articles").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "Could not delete that article." };
  updateTag(ARTICLES_TAG);
  return { ok: true };
}

export type Version = { id: number; at: string; by: string | null; title: string };

/** Earlier versions of an article (FR-CMS-008), newest first. */
export async function versionsAction(articleId: string): Promise<Version[]> {
  const me = await requireStaff();
  if (!can(me.permissions, "content", "view") || !isSupabaseConfigured) return [];
  const { data } = await (await createClient()).from("content_versions").select("id, at, saved_by_name, snapshot").eq("kind", "article").eq("ref", articleId).order("at", { ascending: false }).limit(30);
  return ((data ?? []) as { id: number; at: string; saved_by_name: string | null; snapshot: { title?: string } }[]).map((v) => ({ id: v.id, at: v.at, by: v.saved_by_name, title: v.snapshot.title ?? "" }));
}

/** One-click restore. The restored text comes back as a draft, so it is checked before it goes live again. */
export async function restoreVersionAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const me = await requireStaff();
  if (!can(me.permissions, "content", "edit")) return { ok: false, error: "You cannot edit articles." };
  const { error } = await (await createClient()).rpc("restore_version", { p_version: id });
  if (error) return { ok: false, error: "Could not restore that version." };
  updateTag(ARTICLES_TAG);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Media library (FR-CMS-007), review moderation (FR-SF-013, FR-CMS-009)
// ---------------------------------------------------------------------------

export type MediaItem = { id: string; path: string; url: string; alt: string | null; folder: string; created_at: string };

export async function mediaListAction(): Promise<MediaItem[]> {
  const me = await requireStaff();
  if (!isSupabaseConfigured || !(can(me.permissions, "content", "view") || can(me.permissions, "products", "view"))) return [];
  const { data } = await (await createClient()).from("media").select("id, path, url, alt, folder, created_at").order("created_at", { ascending: false }).limit(300);
  return (data ?? []) as MediaItem[];
}

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif", "video/mp4": "mp4" };

/** Uploads to the public media bucket and records it with alt text. Next resizes and compresses on delivery. */
export async function mediaUploadAction(fd: FormData): Promise<{ ok: boolean; error?: string; path?: string }> {
  const me = await requireStaff();
  if (!isSupabaseConfigured) return { ok: false, error: "Connect Supabase first." };
  if (!(can(me.permissions, "content", "create") || can(me.permissions, "products", "edit"))) return { ok: false, error: "You cannot upload media." };
  const file = fd.get("file");
  const alt = String(fd.get("alt") ?? "").trim().slice(0, 200);
  const folder = String(fd.get("folder") ?? "general").replace(/[^a-z0-9-]/g, "").slice(0, 30) || "general";
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  const ext = IMAGE_TYPES[file.type];
  if (!ext || file.size > 8 * 1024 * 1024) return { ok: false, error: "Use a JPG, PNG, WebP, AVIF, GIF or MP4 up to 8 MB." };
  const base = file.name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "file";
  const path = `${folder}/${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const supabase = await createClient();
  const up = await supabase.storage.from("media").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (up.error) return { ok: false, error: "Upload failed. Check the storage bucket is set up." };
  const { data } = supabase.storage.from("media").getPublicUrl(path);
  const { error } = await supabase.from("media").insert({ path, url: data.publicUrl, alt: alt || null, folder, mime: file.type, size: file.size, created_by: me.id });
  return error ? { ok: false, error: "Saved the file but not its details." } : { ok: true, path };
}

export async function mediaAltAction(id: string, alt: string): Promise<{ ok: boolean }> {
  await requireStaff();
  const { error } = await (await createClient()).from("media").update({ alt: alt.trim().slice(0, 200) || null }).eq("id", id);
  return { ok: !error };
}

export type ReviewRow = { id: string; rating: number; title: string | null; body: string; display_name: string; city: string | null; source: string; verified: boolean; consent: boolean; status: string; created_at: string; product: { name: string; slug: string } | null };

export async function reviewsAction(): Promise<ReviewRow[]> {
  const me = await requireStaff();
  if (!isSupabaseConfigured || !(can(me.permissions, "content", "view") || can(me.permissions, "customers", "view"))) return [];
  const { data } = await (await createClient()).from("reviews").select("id, rating, title, body, display_name, city, source, verified, consent, status, created_at, product:products(name, slug)").order("created_at", { ascending: false }).limit(300);
  return ((data ?? []) as unknown as (Omit<ReviewRow, "product"> & { product: ReviewRow["product"] | ReviewRow["product"][] })[]).map((r) => ({ ...r, product: Array.isArray(r.product) ? r.product[0] ?? null : r.product }));
}

export async function moderateReviewAction(id: string, patch: { status?: "approved" | "hidden" | "pending"; body?: string; title?: string }): Promise<{ ok: boolean; error?: string }> {
  const me = await requireStaff();
  const { error, data } = await (await createClient()).from("reviews").update({ ...patch, moderated_by: me.id, moderated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "You cannot moderate reviews." };
  updateTag(REVIEWS_TAG);
  return { ok: true };
}

/** A review from the Instagram Reviews highlight or WhatsApp, published only with the customer's agreement. */
export async function addSocialReviewAction(r: { productSlug: string; rating: number; body: string; name: string; source: "instagram" | "whatsapp"; consent: boolean }): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  if (!r.consent) return { ok: false, error: "Only publish a review the customer agreed to." };
  const supabase = await createClient();
  const { data: p } = await supabase.from("products").select("id").eq("slug", r.productSlug).maybeSingle();
  const { error } = await supabase.from("reviews").insert({ product_id: p?.id ?? null, rating: r.rating, body: r.body.trim(), display_name: r.name.trim() || "Customer", source: r.source, consent: true, status: "approved" });
  if (error) return { ok: false, error: "Could not add it. Check the rating and text." };
  updateTag(REVIEWS_TAG);
  return { ok: true };
}

export async function siteSettingsAction(data: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const me = await requireStaff();
  if (!(can(me.permissions, "settings", "edit") || can(me.permissions, "content", "edit"))) return { ok: false, error: "You cannot change site settings." };
  const { error } = await (await createClient()).from("site_settings").update({ data, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return { ok: false, error: "Could not save." };
  updateTag(SITE_TAG);
  return { ok: true };
}
