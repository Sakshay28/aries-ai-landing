import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_DETAILS } from '@/lib/types';
import { env } from '@/lib/env';
import { logAuthEvent } from '@/lib/auth/events';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const storedState = req.cookies.get('google_oauth_state')?.value;
  const ip = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
           || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           || 'unknown';

  if (errorParam) {
    console.error('Google OAuth error:', errorParam, searchParams.get('error_description'));
    await logAuthEvent('google_oauth_failed', '', ip, { error: errorParam });
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const rawNonce = req.cookies.get('google_oauth_nonce')?.value;

  if (!state || !storedState || state !== storedState) {
    console.error('OAuth state mismatch');
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  if (!code || !rawNonce) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!env.GOOGLE_CLIENT_ID || !clientSecret) {
    console.error('Google OAuth client ID/secret is not configured');
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Exchange Google authorization code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();

  if (!tokens.id_token) {
    console.error('Google token exchange failed:', tokens);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Sign in to Supabase using the Google ID token
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
    },
  );

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: tokens.id_token,
    nonce: rawNonce,
  });

  if (error || !data.user) {
    console.error('Supabase signInWithIdToken failed:', error);
    await logAuthEvent('google_oauth_failed', '', ip, { error: error?.message, step: 'signInWithIdToken' });
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const user = data.user;

  const applySessionCookies = (response: NextResponse) => {
    response.cookies.delete('google_oauth_state');
    response.cookies.delete('google_oauth_nonce');
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

  // Returning user — go to dashboard
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('tenant_id')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (existingUser) {
    await logAuthEvent('google_oauth_success', user.email ?? '', ip, { userId: user.id, returning: true });
    return applySessionCookies(NextResponse.redirect(`${origin}/dashboard`));
  }

  // New user — auto-provision tenant + user row
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
        onboarding_completed: false,
      })
      .select()
      .single();

    if (tenantError || !tenant) {
      console.error('OAuth tenant create failed:', tenantError);
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
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      console.error('OAuth user create failed:', userError);
      await logAuthEvent('google_oauth_failed', user.email ?? '', ip, { error: userError.message, step: 'create_user' });
      return NextResponse.redirect(`${origin}/login?error=signup_failed`);
    }

    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenant.id,
      event_type: 'user_signup',
      metadata: { email: user.email, source: 'google_oauth', plan: 'starter' },
    });

    await logAuthEvent('google_oauth_success', user.email ?? '', ip, { userId: user.id, returning: false, tenantId: tenant.id });
    return applySessionCookies(NextResponse.redirect(`${origin}/onboard`));
  } catch (err) {
    console.error('OAuth callback error:', err);
    await logAuthEvent('google_oauth_failed', user?.email ?? '', ip, { error: String(err), step: 'provision' }).catch(() => {});
    return NextResponse.redirect(`${origin}/login?error=signup_failed`);
  }
}
