"use client";

import { useEffect, useState } from "react";
import { sessionId, track } from "@/lib/track";

const send = (body: Record<string, unknown>) => {
  const data = JSON.stringify({ ...body, session: sessionId() });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/article-event", new Blob([data], { type: "application/json" }));
    else void fetch("/api/article-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: data, keepalive: true });
  } catch {
    /* ignore */
  }
};

/** Counts a view, and when the reader leaves, how far they scrolled and how long they read (FR-JR-010). Renders nothing. */
export function ArticleReader({ slug }: { slug: string }) {
  useEffect(() => {
    const start = Date.now();
    let depth = 0;
    track("article_view", { article: slug });
    send({ slug, kind: "view" });
    const onScroll = () => {
      const h = document.documentElement;
      depth = Math.max(depth, Math.min(100, Math.round(((h.scrollTop + window.innerHeight) / h.scrollHeight) * 100)));
    };
    const leave = () => send({ slug, kind: "read", depth, seconds: Math.round((Date.now() - start) / 1000) });
    const onHide = () => document.visibilityState === "hidden" && leave();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      leave();
    };
  }, [slug]);
  return null;
}

/** Share buttons for an article (FR-JR-002): WhatsApp first, then the phone's share sheet or copy link. */
export function ShareArticle({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <button type="button" className="btn-outline !min-h-10" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${window.location.href}`)}`, "_blank", "noopener,noreferrer")}>Share on WhatsApp</button>
      <button type="button" className="btn-outline !min-h-10" onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ title, url: window.location.href });
          else { await navigator.clipboard.writeText(window.location.href); setCopied(true); }
        } catch { /* cancelled */ }
      }}>{copied ? "Link copied" : "Share"}</button>
    </div>
  );
}
