// ═══════════════════════════════════════════════════════════
// 🔐 Auth API — Login
// ═══════════════════════════════════════════════════════════
// Uses @supabase/ssr createServerClient so that the session
// is written as httpOnly cookies, never exposed in the
// response body. Tokens in JSON bodies are XSS-stealable.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import { checkRedisRateLimit } from '@/lib/redis/client';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Brute-force protection: 10 attempts per IP per 15 minutes.
    const ip = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
             || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
             || 'unknown';
    const ipLimit = await checkRedisRateLimit(`login:ip:${ip}`, 10, 900);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      );
    }

    // Secondary per-email limit: 5 attempts per 15 min per email.
    const emailKey = email.toLowerCase().replace(/[^a-z0-9@._-]/g, '');
    const emailLimit = await checkRedisRateLimit(`login:email:${emailKey}`, 5, 900);
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts for this account. Please try again in 15 minutes.' },
        { status: 429 }
      );
    }

    type CookieEntry = { name: string; value: string; options: Record<string, unknown> };
    const pendingCookies: CookieEntry[] = [];

    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              pendingCookies.push({ name, value, options: options as Record<string, unknown> });
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      return NextResponse.json(
        { success: false, error: error?.message || 'Invalid credentials' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      data: {
        userId: data.user.id,
        email: data.user.email,
      },
    });

    // Write session as httpOnly cookies — tokens never appear in the response body
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
  } catch (err) {
    console.error('❌ Login error:', err);
    return NextResponse.json(
      { success: false, error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
