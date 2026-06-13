// ═══════════════════════════════════════════════════════════
// 🔐 Provision API — Post-OTP Tenant Creation
// ═══════════════════════════════════════════════════════════
// After successful browser-side OTP verification, this route
// ensures a tenant and users database row are created safely.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_DETAILS } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { email, fullName, businessName, authId } = await req.json();

    if (!email || !fullName || !authId) {
      return NextResponse.json({ success: false, error: 'Email, Name, and Auth ID are required' }, { status: 400 });
    }

    // Check if user already exists in public.users to avoid double creation
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, tenant_id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ success: true, message: 'Already provisioned', tenantId: existingUser.tenant_id });
    }

    // Create the tenant
    const planDetail = PLAN_DETAILS.starter;
    const finalBusinessName = businessName?.trim() || `${fullName.split(' ')[0]}'s Business`;

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        business_name: finalBusinessName,
        business_type: 'Other',
        business_email: email,
        bot_name: 'Aria',
        plan: 'starter',
        message_limit: planDetail.messageLimit,
        ai_conversation_limit: planDetail.aiConversationLimit,
        onboarding_completed: false, // Wizard will handle updating this to true
      })
      .select()
      .single();

    if (tenantError || !tenant) {
      console.error('❌ Provisioning: tenant insertion failed', tenantError);
      return NextResponse.json({ success: false, error: 'Failed to create business tenant' }, { status: 500 });
    }

    // Create the user profile linked to the tenant and auth record
    const { error: userError } = await supabaseAdmin.from('users').insert({
      tenant_id: tenant.id,
      auth_id: authId,
      email,
      full_name: fullName,
      role: 'owner',
      is_platform_admin: email === process.env.PLATFORM_ADMIN_EMAIL,
    });

    if (userError) {
      console.error('❌ Provisioning: user profile insertion failed', userError);
      // Best-effort cleanup of orphan tenant
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      return NextResponse.json({ success: false, error: 'Failed to create user profile' }, { status: 500 });
    }

    // Log success analytics
    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenant.id,
      event_type: 'user_signup',
      metadata: { email, source: 'otp_provision', plan: 'starter' },
    });

    console.log(`🎉 New OTP Signup Provisioned: ${finalBusinessName}`);

    return NextResponse.json({ success: true, tenantId: tenant.id });
  } catch (err) {
    console.error('❌ OTP Provision API Error:', err);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred during account provisioning' }, { status: 500 });
  }
}
