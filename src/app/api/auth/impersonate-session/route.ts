import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';

// GET /api/auth/impersonate-session?at=ACCESS_TOKEN&rt=REFRESH_TOKEN
// Called by /impersonate page after parsing the magic-link hash.
// Sets the session server-side so httpOnly cookies are written properly,
// then redirects to /dashboard with the client's session active.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const accessToken = searchParams.get('at');
  const refreshToken = searchParams.get('rt');

  if (!accessToken || !refreshToken) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  type CookieEntry = { name: string; value: string; options: Record<string, unknown> };
  const pendingCookies: CookieEntry[] = [];

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            pendingCookies.push({ name, value, options: options as Record<string, unknown> });
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    console.error('[impersonate-session] setSession failed:', error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const response = NextResponse.redirect(`${origin}/dashboard`);
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, {
      ...options,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: (options?.path as string) ?? '/',
    });
  });

  return response;
}
