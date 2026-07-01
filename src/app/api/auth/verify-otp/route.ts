import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { logAuthEvent } from '@/lib/auth/events';

const ALLOWED_OTP_TYPES = new Set(['email', 'sms', 'phone_change', 'email_change', 'magiclink']);

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
           || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           || 'unknown';

  try {
    const body = await req.json();
    const { email, token, type } = body;

    if (!email || !token) {
      return NextResponse.json(
        { success: false, error: 'Email and verification code are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedToken = String(token).trim();

    if (!normalizedToken.match(/^[0-9a-zA-Z]{6,8}$/)) {
      return NextResponse.json(
        { success: false, error: 'Invalid verification code format.' },
        { status: 400 }
      );
    }

    const resolvedType = ALLOWED_OTP_TYPES.has(type) ? type : 'email';

    // Brute-force protection: 10 attempts per IP per 15 min + 10 per email per 15 min
    const [ipLimit, emailLimit] = await Promise.all([
      checkRedisRateLimit(`verify-otp:ip:${ip}`, 10, 900),
      checkRedisRateLimit(`verify-otp:email:${normalizedEmail}`, 10, 900),
    ]);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      await logAuthEvent('otp_verify_rate_limited', normalizedEmail, ip, { remaining: 0 });
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please wait 15 minutes and try again.' },
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

    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedToken,
      type: resolvedType,
    });

    if (error) {
      console.error('❌ Server-side OTP verification failed:', error.message);
      await logAuthEvent('otp_verify_failed', normalizedEmail, ip, { error: error.message });
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (!data.session) {
      await logAuthEvent('otp_verify_no_session', normalizedEmail, ip, {});
      return NextResponse.json(
        { success: false, error: 'Verification failed — no session returned.' },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      success: true,
      data: {
        userId: data.session.user.id,
        email: data.session.user.email,
      },
    });

    // Apply the collected cookies onto the response with hardened options (httpOnly: true)
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, {
        ...options,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: (options?.path as string) ?? '/',
      });
    });

    await logAuthEvent('otp_verify_success', normalizedEmail, ip, { userId: data.session.user.id });
    console.log('✅ Server-side OTP login success');
    return response;
  } catch (err) {
    console.error('❌ verify-otp API error:', err);
    await logAuthEvent('otp_verify_error', '', ip, { error: String(err) }).catch(() => {});
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
