import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * unauthenticated users away from protected areas. Role checks (admin vs
 * team) are enforced again server-side in layouts and every API route.
 */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR-PROJECT-REF")) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;

  const needsAuth = path.startsWith("/hunt") || (path.startsWith("/admin") && path !== "/admin/login");
  if (needsAuth && !data.user) {
    const to = req.nextUrl.clone();
    to.pathname = path.startsWith("/admin") ? "/admin/login" : "/join";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return res;
}

export const config = {
  matcher: ["/hunt/:path*", "/admin/:path*", "/api/:path*"],
};
