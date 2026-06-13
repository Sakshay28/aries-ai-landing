import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';

export async function POST(req: NextRequest) {
  try {
    const { email, token, type } = await req.json();

    if (!email || !token) {
      return NextResponse.json(
        { success: false, error: 'Email and verification code are required' },
        { status: 400 }
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
      email,
      token,
      type: type || 'email',
    });

    if (error) {
      console.error('❌ Server-side OTP verification failed:', error.message);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (!data.session) {
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

    console.log('✅ Server-side OTP login success');
    return response;
  } catch (err) {
    console.error('❌ verify-otp API error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
