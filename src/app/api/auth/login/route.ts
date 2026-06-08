// ═══════════════════════════════════════════════════════════
// 🔐 Auth API — Login
// ═══════════════════════════════════════════════════════════
// Auth via plain @supabase/supabase-js (returns tokens), then
// the client uses setSession() to install cookies via the SSR
// browser client. This avoids any cookie-propagation issues
// across response boundaries.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
    // Applied before the Supabase call so failed credential stuffing
    // attacks don't rack up Supabase auth attempts or waste DB queries.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ipLimit = await checkRedisRateLimit(`login:ip:${ip}`, 10, 900);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      );
    }

    // Secondary per-email limit: 5 attempts per 15 min per email — catches
    // distributed attacks from many IPs targeting one account.
    const emailKey = email.toLowerCase().replace(/[^a-z0-9@._-]/g, '');
    const emailLimit = await checkRedisRateLimit(`login:email:${emailKey}`, 5, 900);
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts for this account. Please try again in 15 minutes.' },
        { status: 429 }
      );
    }

    const supabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      return NextResponse.json(
        { success: false, error: error?.message || 'Invalid credentials' },
        { status: 401 }
      );
    }

    console.log(`✅ Login: ${email}`);
    return NextResponse.json({
      success: true,
      data: {
        userId: data.user.id,
        email: data.user.email,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    return NextResponse.json(
      { success: false, error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
