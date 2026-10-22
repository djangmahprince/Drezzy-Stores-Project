"use server";

import { updateTag } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { ARTICLES_TAG } from "@/lib/catalogue/tags";
import { readingMinutes } from "@/lib/articles/format";
import { can } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ArticleInput = {
  id?: string; slug: string; title: string; type: string; intro: string; body: string; tone: string; kind: string;
  status: "draft" | "in_review" | "published"; publishAt: string | null;
};
export type ArticleResult = { ok: true; id: string } | { ok: false; error: string };

const types = ["Outfit guide", "How-to", "Trends"];
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
  const row = { slug: a.slug, title, type: a.type, intro, body: a.body.trim() || null, tone: a.tone, kind: a.kind, status: a.status, publish_at: publishAt, minutes: Math.min(60, readingMinutes(intro, a.body)) };
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
