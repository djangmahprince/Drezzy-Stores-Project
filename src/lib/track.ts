"use client";

// First-party analytics (PRD section 24). Event names follow GA4, so they can be forwarded to Google Analytics and ad
// pixels later. Every event carries an anonymous random session id, never a name, phone or email. Visitors who decline
// analytics are still counted, but without where they came from, which device they use or any detail (anonymous aggregate).
// Failures are ignored: tracking must never get in a shopper's way.

export type EventName =
  | "page_view" | "view_item_list" | "search" | "view_item" | "select_size" | "add_to_cart" | "remove_from_cart" | "add_to_wishlist"
  | "begin_checkout" | "add_shipping_info" | "add_payment_info" | "source_answer" | "payment_failed" | "purchase" | "order_status_view"
  | "whatsapp_click" | "article_view" | "article_product_click" | "quiz_complete" | "sign_up" | "login" | "newsletter_subscribe"
  | "notify_me" | "pwa_install" | "notification_opt_in" | "referral_used" | "feedback";

/** The older funnel step names, still used by a few components. */
export type StepName = "visit" | "product_view" | "add_to_cart" | "checkout_started";
const stepToEvent: Record<StepName, EventName> = { visit: "page_view", product_view: "view_item", add_to_cart: "add_to_cart", checkout_started: "begin_checkout" };

export type Consent = "all" | "essential" | null;
const CONSENT_KEY = "drezzy.consent.v1";
const ATTR_KEY = "drezzy.attr.v1";

const store = (s: "local" | "session") => {
  try {
    return s === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

export function getConsent(): Consent {
  const v = store("local")?.getItem(CONSENT_KEY);
  return v === "all" || v === "essential" ? v : null;
}

export function setConsent(c: "all" | "essential") {
  try {
    store("local")?.setItem(CONSENT_KEY, c);
    window.dispatchEvent(new Event("drezzy:consent"));
  } catch {
    /* ignore */
  }
}

export function sessionId(): string | null {
  const s = store("session");
  if (!s) return null;
  let id = s.getItem("drezzy.sid");
  if (!id) {
    id = crypto.randomUUID();
    s.setItem("drezzy.sid", id);
  }
  return id;
}

export type Attribution = { utm_source?: string; utm_medium?: string; utm_campaign?: string; referrer?: string; article?: string; session?: string; device?: "mobile" | "tablet" | "desktop" };

const device = (): "mobile" | "tablet" | "desktop" => (window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop");

/** Captured once per visit, on arrival: the UTM tags in the link and the referring site. Kept for the session. */
export function captureArrival() {
  const s = store("session");
  if (!s || s.getItem(ATTR_KEY)) return;
  const q = new URLSearchParams(window.location.search);
  const a: Attribution = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign"] as const) {
    const v = q.get(k);
    if (v) a[k] = v.toLowerCase().slice(0, 60);
  }
  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, "");
      if (host && host !== window.location.hostname) a.referrer = host.slice(0, 200);
    }
  } catch {
    /* ignore */
  }
  s.setItem(ATTR_KEY, JSON.stringify(a));
}

/** Where this visit came from, plus the last Drip School article that led to a product (credited for 7 days). */
export function getAttribution(): Attribution {
  const out: Attribution = { session: sessionId() ?? undefined, device: typeof window !== "undefined" ? device() : undefined };
  if (getConsent() === "essential") return out;
  try {
    Object.assign(out, JSON.parse(store("session")?.getItem(ATTR_KEY) ?? "{}"));
    const art = JSON.parse(store("local")?.getItem("drezzy.article.v1") ?? "null") as { slug: string; at: number } | null;
    if (art && Date.now() - art.at < 7 * 86_400_000) out.article = art.slug;
  } catch {
    /* ignore */
  }
  return out;
}

/** Remembers that a shopper went from an article to a product, so a later sale can be credited to the article. */
export function creditArticle(slug: string) {
  try {
    store("local")?.setItem("drezzy.article.v1", JSON.stringify({ slug, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

const queue: Record<string, unknown>[] = [];
let timer: number | undefined;

function flush() {
  timer = undefined;
  if (!queue.length) return;
  const events = queue.splice(0, 25);
  const body = JSON.stringify({ events });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
  if (queue.length) timer = window.setTimeout(flush, 500);
}

/** Records one event. Batched and sent in the background. */
export function track(name: EventName, params: Record<string, string | number | boolean | null | undefined> = {}) {
  if (typeof window === "undefined") return;
  const sid = sessionId();
  if (!sid) return;
  const full = getConsent() !== "essential";
  const a = full ? getAttribution() : {};
  queue.push({
    session: sid, name, path: window.location.pathname.slice(0, 200),
    ...(full ? { params, device: device(), utm_source: a.utm_source, utm_medium: a.utm_medium, utm_campaign: a.utm_campaign, referrer: a.referrer } : {}),
  });
  // forward to third-party tags only with consent (FR-AN-012)
  if (getConsent() === "all") {
    const w = window as unknown as { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void; ttq?: { track: (n: string, p?: unknown) => void } };
    w.gtag?.("event", name, params);
    if (name === "purchase") w.fbq?.("track", "Purchase", { value: params.value, currency: "GHS" });
    if (name === "add_to_cart") w.ttq?.track("AddToCart", params);
  }
  if (timer === undefined) timer = window.setTimeout(flush, 800);
}

/** The original funnel helper, kept for existing callers. */
export function trackEvent(name: StepName, params: Record<string, string | number | boolean | null | undefined> = {}) {
  track(stepToEvent[name], params);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
}
