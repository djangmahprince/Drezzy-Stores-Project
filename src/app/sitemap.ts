import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/articles/server";
import { getCatalogue } from "@/lib/catalogue/server";
import { siteUrl } from "@/lib/notify/send";
import { getPageSlugs, getSiteContent } from "@/lib/site/server";

/** The sitemap (FR-SF-015): every product, article, look, collection and help page, so search engines find them. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl().replace(/\/$/, "");
  const [products, articles, site, pages] = await Promise.all([getCatalogue(), getArticles(), getSiteContent(), getPageSlugs().catch(() => [] as string[])]);
  const fixed = ["", "/shop", "/drip-school", "/drip-school/glossary", "/drops", "/looks", "/style-quiz", "/track",
    ...["delivery", "payment", "order-issues", "size-guide", "faq", "contact", "about", "privacy", "terms"].map((t) => `/help/${t}`)];
  return [
    ...fixed.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.6 })),
    ...products.map((p) => ({ url: `${base}/product/${p.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...articles.map((a) => ({ url: `${base}/drip-school/${a.slug}`, lastModified: a.publish_at ?? undefined, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...site.looks.map((l) => ({ url: `${base}/looks/${l.slug}`, priority: 0.5 })),
    ...site.collections.map((c) => ({ url: `${base}/collections/${c.slug}`, priority: 0.6 })),
    ...pages.filter((p) => !fixed.includes(`/help/${p}`)).map((p) => ({ url: `${base}/help/${p}`, priority: 0.4 })),
  ];
}
