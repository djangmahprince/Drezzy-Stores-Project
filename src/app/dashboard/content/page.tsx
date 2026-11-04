import Link from "next/link";
import { Suspense } from "react";
import { ContentCalendar, MediaLibrary, ReviewModeration } from "@/components/dashboard/ContentTools";
import { CrudEditor } from "@/components/dashboard/CrudEditor";
import { PageHead, Pill, Table } from "@/components/dashboard/DashShell";
import { Guard } from "@/components/dashboard/Guard";
import { listArticles } from "@/lib/articles/staff";
import { requireStaff } from "@/lib/auth";
import { articles as starter } from "@/lib/data";
import { can } from "@/lib/permissions";
import { lastDays } from "@/lib/period";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Drip School and content" };

const word = { draft: "Draft", in_review: "In review", published: "Published" } as const;
const stamp = (iso: string) => new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" }).format(new Date(iso));

const tabs: [string, string][] = [
  ["articles", "Articles"], ["calendar", "Calendar"], ["metrics", "Article results"], ["home", "Home page"], ["banners", "Banners"], ["announcements", "Announcement bar"],
  ["collections", "Collections"], ["looks", "Shop the look"], ["pages", "Pages"], ["media", "Media library"], ["reviews", "Reviews"], ["glossary", "Glossary"],
  ["coupons", "Coupons"], ["newsletter", "Newsletter"],
];

async function Articles() {
  const { articles, canWrite, now } = await listArticles();
  return (
    <>
      {canWrite && <div className="mb-3"><Link href="/dashboard/content/new" className="btn-primary !min-h-10">New article</Link></div>}
      {articles.length === 0 ? (
        <p className="card p-8 text-center text-sm text-text2">No articles yet. The shop shows the built-in starter articles until you publish one.</p>
      ) : (
        <Table head={["Title", "Type", "Status", "Updated", "By"]} rows={articles.map((a) => {
          const scheduled = a.status === "published" && a.publishAt !== null && Date.parse(a.publishAt) > now;
          return [
            <Link key={a.id} href={`/dashboard/content/${a.id}`} className="font-semibold text-navy underline">{a.title}{a.featured ? " ★" : ""}</Link>, a.type,
            <Pill key={a.id + "s"} tone={a.status === "published" ? (scheduled ? "info" : "ok") : a.status === "in_review" ? "warn" : "info"}>{scheduled ? `Scheduled ${stamp(a.publishAt!)}` : word[a.status]}</Pill>,
            stamp(a.updatedAt), a.authorName ?? "",
          ];
        })} />
      )}
    </>
  );
}

async function Calendar() {
  const { articles } = await listArticles();
  return <ContentCalendar articles={articles.map((a) => ({ id: a.id, title: a.title, status: a.status, publishAt: a.publishAt }))} />;
}

/** Per-article results (FR-JR-010): views, read time, product clicks, add-to-bags and sales credited, last 30 days. */
async function Metrics() {
  const { from, to } = await lastDays(30);
  const { data } = await (await createClient()).rpc("article_metrics", { p_from: from, p_to: to });
  const rows = (data ?? []) as { slug: string; title: string; views: number; avg_seconds: number | null; avg_depth: number | null; product_clicks: number; add_to_bags: number; orders: number; sales: number | null }[];
  return (
    <>
      <p className="mb-3 text-sm text-text2">Last 30 days. Sales are credited when a shopper went from the article to a product and ordered within 7 days.</p>
      <Table head={["Article", "Views", "Avg read", "Scrolled", "Product clicks", "Added to bag", "Orders", "Sales"]} rows={rows.map((r) => [
        r.title, r.views, r.avg_seconds ? `${Math.round(r.avg_seconds / 60)}m ${r.avg_seconds % 60}s` : "-", r.avg_depth !== null ? `${r.avg_depth}%` : "-", r.product_clicks, r.add_to_bags, r.orders, r.sales === null ? "Hidden" : `GHS ${Number(r.sales).toLocaleString("en-GH")}`,
      ])} />
    </>
  );
}

async function Newsletter() {
  const { count } = await (await createClient()).from("newsletter_subscribers").select("id", { count: "exact", head: true }).is("unsubscribed_at", null);
  return (
    <div className="card space-y-3 p-5 text-sm">
      <p className="text-3xl font-bold">{count ?? 0}</p>
      <p className="text-text2">people get the Drip School digest. It goes out on Mondays when there are new stories, with a one-click unsubscribe link.</p>
      <a className="btn-outline !min-h-10" href="/api/export?kind=subscribers&format=csv">Export the list (CSV)</a>
    </div>
  );
}

async function Tab({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab = "articles" }, me] = await Promise.all([searchParams, requireStaff()]);
  const edit = can(me.permissions, "content", "edit");
  const t = tabs.some(([k]) => k === tab) ? tab : "articles";
  return (
    <>
      <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto pb-1" aria-label="Content sections">
        {tabs.map(([k, l]) => <Link key={k} href={`/dashboard/content?tab=${k}`} aria-current={t === k ? "page" : undefined} className={`chip min-h-9 shrink-0 px-3 ${t === k ? "bg-navy text-white" : "bg-white text-navy"}`}>{l}</Link>)}
      </nav>
      {t === "articles" && <Articles />}
      {t === "calendar" && <Calendar />}
      {t === "metrics" && <Metrics />}
      {t === "home" && <CrudEditor name="home_sections" canEdit={edit} intro="Choose the sections of the shop's home page, their order and headings (FR-CMS-001). Lower numbers come first." />}
      {t === "banners" && <CrudEditor name="banners" canEdit={edit} intro="Hero and promo banners with start and end dates, and separate phone and desktop images (FR-CMS-002)." />}
      {t === "announcements" && <CrudEditor name="announcements" canEdit={edit} intro="The lime bar at the top of every shop page (FR-CMS-003). With nothing active, it shows the delivery promise from Settings." />}
      {t === "collections" && <CrudEditor name="collections" canEdit={edit} intro="Product lists at /collections/web-address: pick products, or set a rule such as all Nike sneakers under GHS 500 (FR-CMS-004)." />}
      {t === "looks" && <CrudEditor name="looks" canEdit={edit} intro="Outfits customers can add to the bag in one tap, with alternatives to swap (FR-SF-011). Use them in articles with [look: web-address]." />}
      {t === "pages" && <CrudEditor name="pages" canEdit={edit} intro="About, Delivery, Payment options, Order issues and refunds, FAQ, Size guide, Terms, Privacy and any other page at /help/web-address (FR-CMS-005). A page here replaces the built-in text. Earlier versions are kept." />}
      {t === "media" && <MediaLibrary />}
      {t === "reviews" && <ReviewModeration />}
      {t === "glossary" && <CrudEditor name="glossary_terms" canEdit={edit} intro="The sneaker and style glossary at /drip-school/glossary (FR-JR-012)." />}
      {t === "coupons" && <CrudEditor name="coupons" canEdit={edit || can(me.permissions, "settings", "edit")} intro="Discount codes with rules: percent or amount, minimum spend, dates and usage limits (FR-SF-009). The database checks every code at checkout." />}
      {t === "newsletter" && <Newsletter />}
    </>
  );
}

function Sample() {
  return (
    <>
      <PageHead title="Drip School and content" sub="Sample articles. Connect Supabase to write your own." />
      <Table head={["Title", "Type", "Status"]} rows={starter.map((a) => [a.title, a.type, <Pill key={a.slug} tone="ok">Published</Pill>])} />
    </>
  );
}

export default function Content({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <Guard module="content">
      {isSupabaseConfigured ? (
        <>
          <PageHead real title="Drip School and content" sub="Articles, the home page, banners, pages, media, reviews and marketing" />
          <Suspense fallback={<div className="h-64 animate-pulse rounded-[12px] bg-white" aria-busy="true" />}>
            <Tab searchParams={searchParams} />
          </Suspense>
        </>
      ) : (
        <Sample />
      )}
    </Guard>
  );
}
