// ═══════════════════════════════════════════════════════════
// 🔐 Auth Callback — Handle OAuth Redirects
// ═══════════════════════════════════════════════════════════
// After Google/Facebook OAuth, Supabase redirects here. For new
// users we auto-provision a tenant + users row using their Google
// profile and send them STRAIGHT to /dashboard. No more multi-step
// onboarding wall — they can refine business details inside Settings.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_DETAILS } from '@/lib/types';
import { env } from '@/lib/env';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Collect cookies written during exchangeCodeForSession so we can
  // apply them directly onto the final redirect response.
  // Using cookieStore (next/headers) and then returning a separate
  // NextResponse.redirect() drops the session — the browser never
  // receives the auth cookies and middleware sees no session → loop.
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

  const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !user) {
    console.error('OAuth exchange failed:', error, 'User:', user);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Helper: apply collected session cookies onto any response
  const applySessionCookies = (response: NextResponse) => {
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
  };

  // Check if user already has a tenant
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('tenant_id')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (existingUser) {
    // Returning user — go straight to where they were heading.
    return applySessionCookies(NextResponse.redirect(`${origin}${next}`));
  }

  // New OAuth user — auto-provision tenant + user with sensible defaults.
  // They land in the dashboard immediately and can refine these later in Settings.
  const fullName: string =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    user.email?.split('@')[0] ||
    'Owner';

  const businessName = fullName ? `${fullName.split(' ')[0]}'s Business` : 'My Business';
  const planDetail = PLAN_DETAILS.starter;

  try {
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        business_name: businessName,
        business_type: 'Other',
        business_email: user.email,
        bot_name: 'Aria',
        plan: 'starter',
        message_limit: planDetail.messageLimit,
        ai_conversation_limit: planDetail.aiConversationLimit,
        onboarding_completed: false, // wizard will set this to true
      })
      .select()
      .single();

    if (tenantError || !tenant) {
      console.error('❌ OAuth tenant create failed:', tenantError);
      return NextResponse.redirect(`${origin}/login?error=signup_failed`);
    }

    const { error: userError } = await supabaseAdmin.from('users').insert({
      tenant_id: tenant.id,
      auth_id: user.id,
      email: user.email,
      full_name: fullName,
      role: 'owner',
      is_platform_admin: user.email === process.env.PLATFORM_ADMIN_EMAIL,
    });

    if (userError) {
      // Best-effort rollback so we don't orphan the tenant.
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      console.error('❌ OAuth user create failed:', userError);
      return NextResponse.redirect(`${origin}/login?error=signup_failed`);
    }

    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenant.id,
      event_type: 'user_signup',
      metadata: { email: user.email, source: 'google_oauth', plan: 'starter' },
    });

    console.log(`🎉 New OAuth signup: ${businessName}`);
    // Send new users to onboarding wizard, not dashboard
    return applySessionCookies(NextResponse.redirect(`${origin}/onboard`));
  } catch (err) {
    console.error('❌ OAuth callback error:', err);
    return NextResponse.redirect(`${origin}/login?error=signup_failed`);
  }
}
