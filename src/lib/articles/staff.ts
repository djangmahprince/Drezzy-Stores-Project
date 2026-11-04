import "server-only";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type StaffArticle = {
  id: string; slug: string; title: string; type: string; minutes: number; intro: string; body: string; tone: string; kind: string;
  status: "draft" | "in_review" | "published"; publishAt: string | null; authorName: string | null; updatedAt: string;
  tags: string[]; featured: boolean; seoTitle: string; seoDescription: string; heroImage: string; shareImage: string; previewToken: string;
};
type Row = { id: string; slug: string; title: string; type: string; minutes: number; intro: string; body: string | null; tone: string; kind: string; status: StaffArticle["status"]; publish_at: string | null; author_name: string | null; updated_at: string;
  tags: string[] | null; featured: boolean | null; seo_title: string | null; seo_description: string | null; hero_image: string | null; share_image: string | null; preview_token: string };

const COLS = "id, slug, title, type, minutes, intro, body, tone, kind, status, publish_at, author_name, updated_at, tags, featured, seo_title, seo_description, hero_image, share_image, preview_token";
const map = (r: Row): StaffArticle => ({ id: r.id, slug: r.slug, title: r.title, type: r.type, minutes: r.minutes, intro: r.intro, body: r.body ?? "", tone: r.tone, kind: r.kind, status: r.status, publishAt: r.publish_at, authorName: r.author_name, updatedAt: r.updated_at,
  tags: r.tags ?? [], featured: !!r.featured, seoTitle: r.seo_title ?? "", seoDescription: r.seo_description ?? "", heroImage: r.hero_image ?? "", shareImage: r.share_image ?? "", previewToken: r.preview_token });

export async function listArticles(): Promise<{ articles: StaffArticle[]; canWrite: boolean; now: number }> {
  const me = await requireStaff();
  await connection();
  const { data } = await (await createClient()).from("articles").select(COLS).order("updated_at", { ascending: false });
  return { articles: ((data ?? []) as Row[]).map(map), canWrite: can(me.permissions, "content", "create"), now: Date.now() };
}

export async function getArticleForEdit(id: string): Promise<StaffArticle | null> {
  await requireStaff();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await (await createClient()).from("articles").select(COLS).eq("id", id).maybeSingle();
  return data ? map(data as Row) : null;
}
