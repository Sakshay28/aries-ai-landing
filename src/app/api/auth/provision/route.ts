// ═══════════════════════════════════════════════════════════
// 🔐 Provision API — Post-OTP Tenant Creation
// ═══════════════════════════════════════════════════════════
// After successful OTP verification, this route creates the
// tenant + users rows. The authId is validated against the
// actual session cookie — never trusted from the request body.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_DETAILS } from '@/lib/types';
import { env } from '@/lib/env';
import { logAuthEvent } from '@/lib/auth/events';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
           || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           || 'unknown';

  try {
    const { email, fullName, businessName } = await req.json();

    if (!email || !fullName) {
      return NextResponse.json({ success: false, error: 'Email and Name are required' }, { status: 400 });
    }

    // Validate the session from cookies — never trust authId from request body
    type CookieEntry = { name: string; value: string; options: Record<string, unknown> };
    const pendingCookies: CookieEntry[] = [];
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return req.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              pendingCookies.push({ name, value, options: options as Record<string, unknown> });
            });
          },
        },
      }
    );

    const { data: { user }, error: sessionErr } = await supabase.auth.getUser();
    if (sessionErr || !user) {
      await logAuthEvent('signup_provision_failed', email, ip, { error: 'no_session' });
      return NextResponse.json({ success: false, error: 'Authentication required. Please verify your code first.' }, { status: 401 });
    }

    const authId = user.id;
    const verifiedEmail = (user.email ?? email).toLowerCase().trim();

    // Check if already provisioned (idempotent — safe to call multiple times)
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id')
      .eq('auth_id', authId)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ success: true, message: 'Already provisioned', tenantId: existingUser.tenant_id });
    }

    // Create the tenant
    const planDetail = PLAN_DETAILS.starter;
    const finalBusinessName = String(businessName ?? '').trim() || `${fullName.split(' ')[0]}'s Business`;

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        business_name: finalBusinessName,
        business_type: 'Other',
        business_email: verifiedEmail,
        bot_name: 'Aria',
        plan: 'starter',
        message_limit: planDetail.messageLimit,
        ai_conversation_limit: planDetail.aiConversationLimit,
        onboarding_completed: false,
      })
      .select()
      .single();

    if (tenantError || !tenant) {
      console.error('❌ Provisioning: tenant insertion failed', tenantError);
      await logAuthEvent('signup_provision_failed', verifiedEmail, ip, { step: 'tenant', error: tenantError?.message });
      return NextResponse.json({ success: false, error: 'Failed to create business workspace.' }, { status: 500 });
    }

    const { error: userError } = await supabaseAdmin.from('users').insert({
      tenant_id: tenant.id,
      auth_id: authId,
      email: verifiedEmail,
      full_name: fullName,
      role: 'owner',
      is_platform_admin: verifiedEmail === process.env.PLATFORM_ADMIN_EMAIL,
    });

    if (userError) {
      console.error('❌ Provisioning: user profile insertion failed', userError);
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      await logAuthEvent('signup_provision_failed', verifiedEmail, ip, { step: 'user', error: userError.message });
      return NextResponse.json({ success: false, error: 'Failed to create user profile.' }, { status: 500 });
    }

    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenant.id,
      event_type: 'user_signup',
      metadata: { email: verifiedEmail, source: 'otp_provision', plan: 'starter' },
    });

    await logAuthEvent('signup_provisioned', verifiedEmail, ip, { tenantId: tenant.id });
    console.log(`🎉 New OTP Signup Provisioned: ${finalBusinessName}`);

    // Build response and forward refreshed session cookies
    const response = NextResponse.json({ success: true, tenantId: tenant.id });
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
    console.error('❌ OTP Provision API Error:', err);
    await logAuthEvent('signup_provision_failed', '', ip, { step: 'unexpected', error: String(err) }).catch(() => {});
    return NextResponse.json({ success: false, error: 'An unexpected error occurred during account setup.' }, { status: 500 });
  }
}
