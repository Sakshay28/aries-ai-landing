// ═══════════════════════════════════════════════════════════
// 🔐 Auth API — Login (Server-Side SSR)
// ═══════════════════════════════════════════════════════════
// Uses the SSR Supabase client so session cookies are written
// directly into the HTTP response — the middleware can then
// read them on every subsequent request.
// ═══════════════════════════════════════════════════════════

import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // We need a mutable headers object to receive Set-Cookie from Supabase
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', 'application/json');

    // Collect cookies that Supabase wants to set
    const cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookies) {
            // Collect all cookies to set in the response
            cookies.forEach((c) => cookiesToSet.push(c));
          },
        },
      }
    );

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    // Build response body
    const body = JSON.stringify({
      success: true,
      data: {
        userId: data.user.id,
        email: data.user.email,
      },
    });

    // Build response and add all Supabase session cookies
    const response = new Response(body, { status: 200, headers: responseHeaders });

    cookiesToSet.forEach(({ name, value, options }) => {
      const cookieOptions = options as {
        maxAge?: number;
        expires?: Date;
        path?: string;
        domain?: string;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: 'strict' | 'lax' | 'none';
      };

      let cookieStr = `${name}=${encodeURIComponent(value)}`;
      if (cookieOptions.maxAge) cookieStr += `; Max-Age=${cookieOptions.maxAge}`;
      if (cookieOptions.path) cookieStr += `; Path=${cookieOptions.path}`;
      else cookieStr += `; Path=/`;
      if (cookieOptions.httpOnly) cookieStr += `; HttpOnly`;
      if (cookieOptions.sameSite) cookieStr += `; SameSite=${cookieOptions.sameSite}`;

      response.headers.append('Set-Cookie', cookieStr);
    });

    console.log(`✅ Login: ${email} — ${cookiesToSet.length} session cookies set`);
    return response;
  } catch (err) {
    console.error('❌ Login error:', err);
    return Response.json(
      { success: false, error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
