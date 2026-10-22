"use client";

// Anonymous visit steps for the funnel. A random id per browser tab session, never a name, phone or email.
// Failures are ignored: tracking must never get in a shopper's way.

export type StepName = "visit" | "product_view" | "add_to_cart" | "checkout_started";

function session(): string | null {
  try {
    let id = window.sessionStorage.getItem("drezzy.sid");
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem("drezzy.sid", id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Where the visitor came from: a utm_source in the link, else the referring site's name, else nothing. */
function source(): string | undefined {
  try {
    const utm = new URLSearchParams(window.location.search).get("utm_source");
    if (utm) return utm.slice(0, 40);
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, "");
      if (host && host !== window.location.hostname) return host.slice(0, 40);
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function trackEvent(name: StepName) {
  const sid = session();
  if (!sid) return;
  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session: sid, name, source: source() }),
    keepalive: true,
  }).catch(() => {});
}
