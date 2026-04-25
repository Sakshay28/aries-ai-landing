// ═══════════════════════════════════════════════════════════
// 🔐 Auth Callback — Handle OAuth Redirects
// ═══════════════════════════════════════════════════════════
// After Google/Facebook OAuth, Supabase redirects here.
// We check if the user has a tenant — if not, redirect to onboarding.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && user) {
      // Check if user has a tenant
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('tenant_id')
        .eq('auth_id', user.id)
        .single();

      if (!existingUser) {
        // New OAuth user — needs onboarding
        // Create a placeholder user record (tenant created during onboarding)
        return NextResponse.redirect(`${origin}/onboard?email=${user.email}&name=${user.user_metadata?.full_name || ''}`);
      }

      // Existing user — go to dashboard
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect to login
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
