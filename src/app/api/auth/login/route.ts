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

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
