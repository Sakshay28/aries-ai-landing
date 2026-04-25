// ═══════════════════════════════════════════════════════════
// 🔒 Auth Proxy — Protect Dashboard Routes (Next.js 16)
// ═══════════════════════════════════════════════════════════
// Checks for a valid Supabase session on every dashboard
// and admin route. Redirects to /login if not authenticated.
// ═══════════════════════════════════════════════════════════

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that require authentication
const PROTECTED_ROUTES = ['/dashboard', '/admin'];
// Routes that should redirect to dashboard if already logged in
const AUTH_ROUTES = ['/login', '/signup'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-protected routes
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (!isProtected && !isAuthRoute) {
    return NextResponse.next();
  }

  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'https://your-project.supabase.co') {
    // Supabase not configured — allow access in development
    return NextResponse.next();
  }

  // Create a Supabase client with cookies from the request
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Get the user session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected route but no session → redirect to login
  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Auth route but already logged in → redirect to dashboard
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Admin routes require platform admin check
  if (pathname.startsWith('/admin') && user) {
    // We can't easily check is_platform_admin in middleware without
    // a DB query. The admin page itself handles this via API.
    // But we ensure they're at least authenticated.
  }

  return response;
}

export const config = {
  matcher: [
    // Match all dashboard and admin routes
    '/dashboard/:path*',
    '/admin/:path*',
    '/login',
    '/signup',
  ],
};
