import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Two jobs:
 *  1. Keeps the Supabase session fresh and sends signed-out visitors away from the staff area. This is a convenience, not
 *     the security boundary: every page and action re-checks the user and their permission close to the data
 *     (lib/auth.ts), and the database enforces the rules again with row-level security.
 *  2. Redirects old shop links to new ones, from the list staff manage in Settings (FR-CMS-010). The list is read with the
 *     public key and kept in memory for a minute, so a shop page never waits on it for long.
 */
type Redirect = { to: string; permanent: boolean };
let redirects: Map<string, Redirect> | null = null;
let loadedAt = 0;

async function redirectFor(path: string): Promise<Redirect | null> {
  if (!isSupabaseConfigured) return null;
  if (!redirects || Date.now() - loadedAt > 60_000) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/redirects?select=from_path,to_path,permanent`, {
        headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` },
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const rows = (await res.json()) as { from_path: string; to_path: string; permanent: boolean }[];
        redirects = new Map(rows.map((r) => [r.from_path.replace(/\/$/, "") || "/", { to: r.to_path, permanent: r.permanent }]));
      }
    } catch {
      // keep the last good list; a slow database never blocks the shop
    }
    loadedAt = Date.now();
  }
  return redirects?.get(path.replace(/\/$/, "") || "/") ?? null;
}

const staffArea = (p: string) => p.startsWith("/dashboard") || p.startsWith("/login") || p.startsWith("/account") || p.startsWith("/partner");

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (!staffArea(path)) {
    const r = await redirectFor(path);
    if (r) {
      const url = /^https:\/\//.test(r.to) ? new URL(r.to) : new URL(r.to, request.url);
      return NextResponse.redirect(url, r.permanent ? 308 : 307);
    }
    return NextResponse.next();
  }

  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && path.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

// Everything except Next's own files, the API, the service worker and files with an extension (images, fonts, robots.txt).
export const config = { matcher: ["/((?!_next/|api/|sw\\.js|.*\\.[a-zA-Z0-9]{2,5}$).*)"] };
