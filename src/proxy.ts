import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Keeps the Supabase session fresh and sends signed-out visitors to the login page.
 * This is a convenience, not the security boundary: every page and action re-checks the user and their
 * permission close to the data (lib/auth.ts), and the database enforces the rules again with row-level security.
 */
export async function proxy(request: NextRequest) {
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
  const path = request.nextUrl.pathname;

  if (!data?.claims && path.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

// The staff area needs a session, and /account keeps a shopper's sign-in fresh. The rest of the storefront is untouched, so it stays fast and cacheable.
export const config = { matcher: ["/dashboard/:path*", "/login/:path*", "/account/:path*", "/account"] };
