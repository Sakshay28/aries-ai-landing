// ═══════════════════════════════════════════════════════════
// 🔐 Auth API — Login (Server-Side SSR)
// ═══════════════════════════════════════════════════════════
// Uses the SSR Supabase client with NextResponse so session
// cookies are properly set for the browser.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Create a NextResponse first so we can mutate cookies on it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: NextResponse<any> = NextResponse.json({ success: false, error: 'Pending' });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // Set cookies on the response using NextResponse
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, {
                path: options?.path || '/',
                maxAge: (options?.maxAge as number) || 34560000,
                sameSite: (options?.sameSite as 'lax' | 'strict' | 'none') || 'lax',
                httpOnly: false, // Supabase needs client-side access
                secure: process.env.NODE_ENV === 'production',
              });
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    // Build success response with the cookies already set
    response = NextResponse.json({
      success: true,
      data: {
        userId: data.user.id,
        email: data.user.email,
      },
    });

    // Re-create supabase client to set cookies on the NEW response object
    const supabase2 = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, {
                path: options?.path || '/',
                maxAge: (options?.maxAge as number) || 34560000,
                sameSite: (options?.sameSite as 'lax' | 'strict' | 'none') || 'lax',
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
              });
            });
          },
        },
      }
    );

    // Re-run sign in to get cookies set on the final response
    await supabase2.auth.signInWithPassword({ email, password });

    console.log(`✅ Login: ${email} — session cookies set on NextResponse`);
    return response;
  } catch (err) {
    console.error('❌ Login error:', err);
    return NextResponse.json(
      { success: false, error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
