import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/notify/send";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl().replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/login", "/account", "/checkout", "/partner", "/api/", "/setup", "/drip-school/preview/", "/unsubscribe"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
