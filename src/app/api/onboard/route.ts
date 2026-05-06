// ═══════════════════════════════════════════════════════════
// 🚀 Onboard API — Create Tenant for OAuth Users
// ═══════════════════════════════════════════════════════════
// When a user signs up via Google OAuth, they don't have a
// tenant yet. This route creates the tenant and user record.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_DETAILS } from '@/lib/types';

// Detect which brand signed up based on request origin or host header
function detectBrand(req: NextRequest): 'aries' | 'libra' {
  const origin = req.headers.get('origin') || req.headers.get('referer') || req.headers.get('host') || '';
  if (origin.includes('libraai.in') || origin.includes('libra')) return 'libra';
  return 'aries';
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user already exists in the users table
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('auth_id', user.id)
      .single();

    if (existingUser) {
      return NextResponse.json({ success: true, tenantId: existingUser.tenant_id, message: 'Already onboarded' });
    }

    const body = await req.json();
    const { businessName, businessType, plan } = body;

    if (!businessName) {
      return NextResponse.json({ success: false, error: 'businessName is required' }, { status: 400 });
    }

    const selectedPlan = plan || 'starter';
    const planDetail = PLAN_DETAILS[selectedPlan as keyof typeof PLAN_DETAILS] || PLAN_DETAILS.starter;
    const brand = detectBrand(req);

    // 1. Create tenant
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        business_name: businessName,
        business_type: businessType || 'Restaurant',
        business_email: user.email,
        bot_name: 'Assistant',
        plan: selectedPlan,
        message_limit: planDetail.messageLimit,
        ai_conversation_limit: planDetail.aiConversationLimit,
        brand,
      })
      .select()
      .single();

    if (tenantError) {
      throw tenantError;
    }

    // 2. Create user record
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        tenant_id: tenant.id,
        auth_id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || 'User',
        role: 'owner',
        is_platform_admin: user.email === process.env.PLATFORM_ADMIN_EMAIL,
      });

    if (userError) {
      // Rollback tenant creation
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      throw userError;
    }

    // 3. Log event
    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenant.id,
      event_type: 'user_onboarded',
      metadata: { email: user.email, plan: selectedPlan },
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        tenantId: tenant.id,
      },
    });
  } catch (err) {
    console.error('❌ Onboard error:', err);
    return NextResponse.json(
      { success: false, error: 'Onboarding failed' },
      { status: 500 }
    );
  }
}
