"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useState, useSyncExternalStore } from "react";
import { captureArrival, getConsent, setConsent, track, type Consent } from "@/lib/track";

const subscribeConsent = (cb: () => void) => {
  window.addEventListener("drezzy:consent", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("drezzy:consent", cb);
    window.removeEventListener("storage", cb);
  };
};
const useConsent = () => useSyncExternalStore<Consent | "unknown">(subscribeConsent, getConsent, () => "unknown");

/** Page views on every navigation, and the arrival source once per visit. */
function PageViews() {
  const path = usePathname();
  useEffect(() => {
    captureArrival();
  }, []);
  useEffect(() => {
    track("page_view", { title: document.title });
  }, [path]);
  return null;
}

/**
 * Privacy-first consent (PRD FR-AN-012, section 21). Nothing third-party loads until the visitor says yes. "Essential only"
 * keeps the shop working and counts the visit without any detail.
 */
function ConsentBanner() {
  const consent = useConsent();
  if (consent !== null) return null;
  return (
    <div role="dialog" aria-label="Cookies and analytics" className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-xl rounded-[16px] bg-navy p-4 text-sm text-white shadow-2xl md:bottom-4">
      <p>We use essential storage to keep your bag and wishlist. With your OK we also measure visits and ads to improve the shop. <Link href="/help/privacy" className="underline">Privacy</Link></p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setConsent("essential")} className="btn !min-h-10 border border-white/40 text-white hover:bg-white/10">Essential only</button>
        <button type="button" onClick={() => setConsent("all")} className="btn-lime !min-h-10">Allow analytics</button>
      </div>
    </div>
  );
}

/** Google Analytics 4, Meta, TikTok and Snap tags: loaded only after consent, and only when their ids are set. */
function Pixels() {
  const consent = useConsent();
  if (consent !== "all") return null;
  const ga = process.env.NEXT_PUBLIC_GA4_ID;
  const meta = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const tiktok = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
  const snap = process.env.NEXT_PUBLIC_SNAP_PIXEL_ID;
  return (
    <>
      {ga && /^G-[A-Z0-9]+$/.test(ga) && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${ga}');`}</Script>
        </>
      )}
      {meta && /^\d+$/.test(meta) && (
        <Script id="meta-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${meta}');fbq('track','PageView');`}</Script>
      )}
      {tiktok && /^[A-Z0-9]+$/.test(tiktok) && (
        <Script id="tiktok-pixel" strategy="afterInteractive">{`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var n="https://analytics.tiktok.com/i18n/pixel/events.js";var a=d.createElement("script");a.async=!0;a.src=n+"?sdkid="+e+"&lib="+t;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(a,s)};ttq.load('${tiktok}');ttq.page()}(window,document,'ttq');`}</Script>
      )}
      {snap && /^[a-f0-9-]+$/i.test(snap) && (
        <Script id="snap-pixel" strategy="afterInteractive">{`(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');snaptr('init','${snap}');snaptr('track','PAGE_VIEW');`}</Script>
      )}
    </>
  );
}

/** Installable web app with an offline fallback (PRD section 22): registers the service worker in production. */
function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onInstall = () => track("pwa_install", { platform: navigator.userAgent.includes("Android") ? "android" : "other" });
    window.addEventListener("appinstalled", onInstall);
    return () => window.removeEventListener("appinstalled", onInstall);
  }, []);
  return null;
}

/** The on-site feedback button (FR-AN-009). */
function Feedback() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const path = usePathname();
  if (path.startsWith("/checkout")) return null;

  async function send() {
    if (msg.trim().length < 2) return setState("error");
    setState("sending");
    const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: path, message: msg, rating }) }).catch(() => null);
    if (r?.ok) {
      track("feedback", { rating: rating ?? undefined });
      setState("done");
    } else setState("error");
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-1/3 right-0 z-30 hidden origin-bottom-right -rotate-90 rounded-t-[10px] bg-navy px-3 py-1.5 text-xs font-semibold text-white md:block">
        Feedback
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Send feedback" className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 md:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-[16px] bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">How is the shop working for you?</h2>
            {state === "done" ? (
              <p className="mt-3 text-success" role="status">Thank you. We read every message.</p>
            ) : (
              <>
                <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} of 5`} onClick={() => setRating(n)}
                      className={`size-10 rounded-full text-lg ${rating !== null && n <= rating ? "bg-lime text-navy" : "bg-card text-text2"}`}>★</button>
                  ))}
                </div>
                <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1000} rows={4} className="field mt-3 py-2" placeholder="What worked, what did not?" aria-label="Your feedback" />
                {state === "error" && <p className="mt-2 text-sm text-error" role="alert">Write a short message and try again.</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" className="btn-outline !min-h-10" onClick={() => setOpen(false)}>Close</button>
                  <button type="button" className="btn-primary !min-h-10" disabled={state === "sending"} onClick={send}>{state === "sending" ? "Sending…" : "Send"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function SiteChrome() {
  return (
    <>
      <PageViews />
      <ConsentBanner />
      <Pixels />
      <ServiceWorker />
      <Feedback />
    </>
  );
}
