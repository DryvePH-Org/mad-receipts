import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// These endpoints authenticate inside the route, not with a session: the scheduled jobs with CRON_SECRET, and the grokbot's answers
// with the token of the job they answer.
const CRON_PATHS = ["/api/sync/run", "/api/reminders/run", "/api/docs/handoff-reminders", "/api/grokbot/callback"];

// Refreshes the Supabase session cookie on every request, then:
// logged out → /login (API routes get 401); logged in on /login → /.
// This is an optimistic check only; pages and routes still verify the user.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (CRON_PATHS.includes(pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const loggedIn = !!data?.claims;
  const onLogin = pathname === "/login";

  if (!loggedIn && !onLogin) {
    if (pathname.startsWith("/api/")) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }
    return redirectKeepingCookies(request, response, "/login");
  }
  if (loggedIn && onLogin) {
    return redirectKeepingCookies(request, response, "/");
  }

  return response;
}

// A redirect must carry any refreshed session cookies, or the user gets logged out.
function redirectKeepingCookies(request: NextRequest, from: NextResponse, path: string) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|offline\\.html|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
