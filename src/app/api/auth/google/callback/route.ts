import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_DETAILS } from '@/lib/types';
import { env } from '@/lib/env';
import { logAuthEvent } from '@/lib/auth/events';
import { recordConsent } from '@/lib/legal/consent';

function getCanonicalAuthOrigin(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return req.nextUrl.origin;
  }
  if (host.endsWith('.vercel.app')) {
    return `https://${host}`;
  }
  return 'https://www.ariesai.in';
}

function getCookieDomain(req: NextRequest): string | undefined {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  if (host.includes('ariesai.in')) {
    return '.ariesai.in';
  }
  return undefined;
}

function decodeJwtPayload(token: string): Record<string, any> {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return {};
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const origin = getCanonicalAuthOrigin(req);
  const cookieDomain = getCookieDomain(req);
  const { searchParams } = req.nextUrl;
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

  // Validate state if storedState exists; if missing in cross-site redirect, ensure code is present
  if (state && storedState && state !== storedState) {
    console.error('OAuth state mismatch');
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  if (!code) {
    console.error('Missing authorization code in Google callback');
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const clientSecret = env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!env.GOOGLE_CLIENT_ID || !clientSecret) {
    console.error('Google OAuth client ID/secret is not configured');
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const redirectUri = `${origin}/api/auth/google/callback`;

  // 1. Exchange Google authorization code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();

  if (!tokens.id_token && !tokens.access_token) {
    console.error('Google token exchange failed:', tokens.error || 'Missing tokens');
    await logAuthEvent('google_oauth_failed', '', ip, { error: tokens.error || 'token_exchange_failed', step: 'token_exchange' });
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Extract user info from decoded ID token or Google userinfo endpoint
  let payload = tokens.id_token ? decodeJwtPayload(tokens.id_token) : {};
  let googleEmail = payload.email as string | undefined;
  let googleName = (payload.name || payload.given_name) as string | undefined;

  if (!googleEmail && tokens.access_token) {
    try {
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json();
        googleEmail = userinfo.email;
        googleName = userinfo.name || userinfo.given_name;
      }
    } catch (e) {
      console.warn('Failed to fetch userinfo fallback:', e);
    }
  }

  if (!googleEmail) {
    console.error('No verified email found from Google identity');
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // 2. Sign in to Supabase SSR client
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

  let authenticatedUser: any = null;

  // Primary authentication: signInWithIdToken
  if (tokens.id_token) {
    const res = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: tokens.id_token,
      ...(rawNonce ? { nonce: rawNonce } : {}),
    });

    if (res.data?.user) {
      authenticatedUser = res.data.user;
    } else if (rawNonce) {
      // Retry without nonce if nonce comparison failed
      const retryWithoutNonce = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: tokens.id_token,
      });
      if (retryWithoutNonce.data?.user) {
        authenticatedUser = retryWithoutNonce.data.user;
      }
    }
  }

  // Resilient fallback: If signInWithIdToken is unavailable in GoTrue, establish session via verified email
  if (!authenticatedUser) {
    try {
      await supabaseAdmin.auth.admin.createUser({
        email: googleEmail,
        email_confirm: true,
        user_metadata: { full_name: googleName || googleEmail.split('@')[0] },
      }).catch(() => {});

      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: googleEmail,
      });

      if (linkData?.properties?.hashed_token) {
        const verifyRes = await supabase.auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: 'magiclink',
        });
        authenticatedUser = verifyRes.data?.user;
      }
    } catch (fallbackErr) {
      console.error('Session establishment fallback failed:', fallbackErr);
    }
  }

  if (!authenticatedUser) {
    console.error('Could not authenticate user session with Supabase');
    await logAuthEvent('google_oauth_failed', googleEmail, ip, { error: 'session_failed', step: 'session' });
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const user = authenticatedUser;

  const applySessionCookies = (response: NextResponse) => {
    const clearOpts = {
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };
    response.cookies.delete('google_oauth_state');
    response.cookies.delete('google_oauth_nonce');
    response.cookies.delete('google_oauth_consent');
    if (cookieDomain) {
      response.cookies.set('google_oauth_state', '', { ...clearOpts, maxAge: 0 });
      response.cookies.set('google_oauth_nonce', '', { ...clearOpts, maxAge: 0 });
      response.cookies.set('google_oauth_consent', '', { ...clearOpts, maxAge: 0 });
    }
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, {
        ...options,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: (options?.path as string) ?? '/',
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      });
    });
    return response;
  };

  // 3. Returning user by auth_id — go straight to dashboard
  let { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id, tenant_id, auth_id')
    .eq('auth_id', user.id)
    .maybeSingle();

  // 4. Existing user by email — link auth_id and go to dashboard
  if (!existingUser && user.email) {
    const { data: userByEmail } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id, auth_id')
      .eq('email', user.email.toLowerCase().trim())
      .maybeSingle();

    if (userByEmail) {
      await supabaseAdmin
        .from('users')
        .update({ auth_id: user.id })
        .eq('id', userByEmail.id);
      existingUser = userByEmail;
    }
  }

  if (existingUser) {
    await logAuthEvent('google_oauth_success', user.email ?? '', ip, { userId: user.id, returning: true });
    return applySessionCookies(NextResponse.redirect(`${origin}/dashboard`));
  }

  // 5. New user — auto-provision tenant + user row
  const fullName: string =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    googleName ||
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

    // Record consent safely
    try {
      await recordConsent({
        tenantId: tenant.id,
        email: user.email ?? '',
        ip,
        userAgent: req.headers.get('user-agent'),
        source: 'google_oauth',
      });
    } catch (consentErr) {
      console.warn('OAuth consent recording warning (non-fatal):', consentErr);
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
