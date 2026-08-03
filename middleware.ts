// ═══════════════════════════════════════════════════════════
// 🔒 Auth Proxy — Protect Dashboard Routes (Next.js 16)
// ═══════════════════════════════════════════════════════════
// Checks for a valid Supabase session on every dashboard
// and admin route. Redirects to /login if not authenticated.
// ═══════════════════════════════════════════════════════════

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { detectBrandFromHost } from '@/lib/brand';
import { env, isSupabaseConfigured } from '@/lib/env';

// Routes that require authentication
const PROTECTED_ROUTES = ['/dashboard', '/admin', '/onboard'];
// Routes that should redirect to dashboard if already logged in
const AUTH_ROUTES = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ═════════════════════════════════════════════════════════
  // 🌗 Brand detection (Aries vs Libra) — host-based routing
  // ═════════════════════════════════════════════════════════
  const host = request.headers.get('host');
  const brand = detectBrandFromHost(host);

  // Forward brand to all downstream handlers via header
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set('x-brand', brand);
  forwardedHeaders.set('x-pathname', pathname);

  // SECURITY: always strip any client-supplied trust headers before we might set
  // our own below. Without this, an unauthenticated request could hand itself
  // someone else's user id and have it trusted by downstream handlers.
  forwardedHeaders.delete('x-verified-user-id');
  forwardedHeaders.delete('x-verified-user-email');

  // Rewrite Libra root requests to the dedicated /libra landing.
  // (Aries keeps the root path so existing links/SEO are unchanged.)
  if (brand === 'libra' && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/libra';
    return NextResponse.rewrite(url, { request: { headers: forwardedHeaders } });
  }

  // Skip non-protected routes
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (!isProtected && !isAuthRoute) {
    return NextResponse.next({ request: { headers: forwardedHeaders } });
  }

  // Check if Supabase is configured
  if (!isSupabaseConfigured) {
    // Supabase not configured — allow access in development
    return NextResponse.next();
  }

  // Create a Supabase client with cookies from the request
  // CANONICAL Supabase SSR pattern — DO NOT recreate `response` inside the loop
  // (that bug drops all cookies set in earlier iterations).
  let response = NextResponse.next({
    request: { headers: forwardedHeaders },
  });

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // SECURITY: harden every auth cookie the SSR client writes.
        // We override httpOnly/secure/sameSite regardless of what
        // Supabase passes through `options` so the session JWT is
        // never exposed to client-side JavaScript.
        const harden = (options: Record<string, unknown> | undefined) => ({
          ...(options ?? {}),
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax' as const,
          path: ((options as { path?: string } | undefined)?.path) ?? '/',
        });

        // 1) Mutate request cookies so downstream server components read them
        cookiesToSet.forEach(({ name, value, options }) => {
          // @ts-ignore
          request.cookies.set({ name, value, ...harden(options) });
        });
        // 2) Recreate the response ONCE with updated cookies
        response = NextResponse.next({
          request: { headers: forwardedHeaders },
        });
        // 3) Set every cookie on the new response
        cookiesToSet.forEach(({ name, value, options }) => {
          // @ts-ignore
          response.cookies.set({ name, value, ...harden(options) });
        });
      },
    },
  });

  // Use getUser() — validates the JWT server-side against Supabase rather than
  // trusting the locally-decoded cookie. A crafted/revoked JWT is caught here.
  //
  // Previous concern: "getUser() caused redirect loops when slow/failed."
  // That loop scenario cannot actually occur:
  //   • middleware: getUser() errors → redirect to /login
  //   • /login page: getUser() also errors → user stays on /login (no bounce back)
  // So on Supabase downtime both checks fail the same way; the user waits on /login
  // until the service recovers — correct behaviour, not a loop.
  const { data: { user }, error: _authErr } = await supabase.auth.getUser();
  // Any error (network failure, expired/invalid token) → treat as unauthenticated.

  // Protected route but no session → redirect to login
  // IMPORTANT: carry over any session cookies that getUser() refreshed
  // onto the redirect response so the browser persists them.
  // Helper: copy every cookie from `response` onto `target`, preserving
  // the security flags we hardened above. Without this, a redirect
  // would write back the cookie with default flags (httpOnly: false),
  // re-exposing the JWT to JS until the next page load.
  const copyHardenedCookies = (target: NextResponse) => {
    response.cookies.getAll().forEach((cookie) => {
      target.cookies.set(cookie.name, cookie.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    });
  };

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    copyHardenedCookies(redirectResponse);
    return redirectResponse;
  }

  // Signup while already logged in still bounces to dashboard — no reason to
  // let someone start a second signup mid-session.
  //
  // /login is different: people land there deliberately to switch accounts
  // (e.g. signing in with a different Google account than the one already
  // active on this browser). Silently redirecting them straight back to
  // /dashboard here is what actually causes the confusing "I signed in as a
  // different account but landed on my old one" report — the Google flow
  // never even got a chance to run. So /login renders normally and shows its
  // own "already signed in as X" banner instead (see x-verified-user-email
  // below), letting the user explicitly continue or log out and switch.
  if (pathname.startsWith('/signup') && user) {
    const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url));
    copyHardenedCookies(redirectResponse);
    return redirectResponse;
  }

  // Forward the identity we just verified so downstream layouts/route handlers
  // (dashboard layout, getTenantId()) can skip a second Supabase Auth round trip
  // per request. Headers were already stripped above, so this is the only place
  // they can be (re-)populated — never from client input.
  if (user) {
    forwardedHeaders.set('x-verified-user-id', user.id);
    forwardedHeaders.set('x-verified-user-email', user.email ?? '');
    const enrichedResponse = NextResponse.next({ request: { headers: forwardedHeaders } });
    copyHardenedCookies(enrichedResponse);
    response = enrichedResponse;
  }

  // Admin routes: require is_platform_admin in addition to authentication.
  // We do a single indexed query (auth_id is the PK lookup) — fast even in Edge.
  // Non-admin authenticated users are redirected to /dashboard, not /login,
  // so the redirect doesn't expose whether /admin exists to unauthenticated visitors.
  if (pathname.startsWith('/admin') && user) {
    const { data: userRow } = await supabase
      .from('users')
      .select('is_platform_admin')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (!userRow?.is_platform_admin) {
      const denyResponse = NextResponse.redirect(new URL('/dashboard', request.url));
      copyHardenedCookies(denyResponse);
      return denyResponse;
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Brand detection on root (Libra rewrite)
    '/',
    // Auth-protected routes
    '/dashboard/:path*',
    '/admin/:path*',
    '/onboard',
    '/login',
    '/signup',
    // API routes that need session refresh
    '/api/dashboard/:path*',
    '/api/webhooks/:path*',
  ],
};
