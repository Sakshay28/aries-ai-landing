// ═══════════════════════════════════════════════════════════
// 🔐 Auth API — Signup & Tenant Creation
// ═══════════════════════════════════════════════════════════
// When a user signs up, we:
//  1. Create their Supabase Auth account
//  2. Create a new tenant (their business)
//  3. Create a user record linked to that tenant
//  4. Return the session
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_DETAILS } from '@/lib/types';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { z } from 'zod';

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  businessName: z.string().min(2, 'Business name must be at least 2 characters').max(100),
  businessType: z.string().optional(),
  plan: z.enum(['starter', 'growth', 'pro', 'enterprise']).optional(),
  brand: z.enum(['aries', 'libra']).optional()
});

// ═══════════════════════════════════════
// POST /api/auth/signup — New user + tenant
// ═══════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
    const rateLimit = await checkRedisRateLimit(`signup:${ip}`, 5, 3600); // 5 attempts per hour per IP
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many signup attempts. Try again later.' }, { status: 429 });
    }

    let parsedBody;
    try {
      const rawBody = await req.json();
      console.log('📝 Signup attempt:', JSON.stringify(rawBody));
      parsedBody = signupSchema.parse(rawBody);
    } catch (e: unknown) {
      // Zod v4 uses e.issues; v3 used e.errors — handle both
      type ZodLikeError = { issues?: { path: string[]; message: string }[]; errors?: { path: string[]; message: string }[]; message?: string };
      const ze = e as ZodLikeError;
      const issues = ze.issues ?? ze.errors ?? [];
      const firstIssue = issues[0];
      const field = firstIssue?.path?.[0] || 'input';
      const message = firstIssue?.message || ze?.message || 'Invalid input data';
      console.log('❌ Signup validation failed:', field, '-', message);
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 }
      );
    }
    const { email, password, fullName, businessName, businessType, plan, brand } = parsedBody;

    // 1. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for now
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      return NextResponse.json(
        { success: false, error: authError.message },
        { status: 400 }
      );
    }

    const authUser = authData.user;

    // 2. Create tenant
    const selectedPlan = plan || 'starter';
    const planDetail = PLAN_DETAILS[selectedPlan as keyof typeof PLAN_DETAILS] || PLAN_DETAILS.starter;

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        business_name: businessName,
        business_type: businessType || 'Restaurant',
        business_email: email,
        bot_name: 'Aria',
        plan: selectedPlan,
        message_limit: planDetail.messageLimit,
        ai_conversation_limit: planDetail.aiConversationLimit,
        // Onboarding wizard will set this to true after collecting business details
        onboarding_completed: false,
      })
      .select()
      .single();

    if (tenantError) {
      // Cleanup: delete auth user if tenant creation fails
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      throw tenantError;
    }

    // 3. Create user record
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        tenant_id: tenant.id,
        auth_id: authUser.id,
        email,
        full_name: fullName,
        role: 'owner',
        is_platform_admin: email === process.env.PLATFORM_ADMIN_EMAIL,
      });

    if (userError) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUser.id);
        await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      } catch (cleanupErr) {
        // Log orphan state — manual cleanup may be needed
        console.error('❌ Signup rollback failed — orphan tenant/user may exist:', cleanupErr);
        const Sentry = await import('@/lib/sentry-stub');
        Sentry.captureException(cleanupErr, {
          extra: { context: 'signup_rollback_failure', authUserId: authUser.id, tenantId: tenant.id },
        });
      }
      throw userError;
    }

    // 4. Log event (fire-and-forget — never block signup on analytics)
    supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenant.id,
      event_type: 'user_signup',
      metadata: { email, plan: selectedPlan },
    }).then(({ error: e }) => { if (e) console.warn('analytics_events insert failed (non-fatal):', e.message); });

    console.log(`🎉 New signup: ${businessName} (${email}) — ${selectedPlan} plan`);

    return NextResponse.json({
      success: true,
      data: {
        userId: authUser.id,
        tenantId: tenant.id,
        email,
        businessName,
        plan: selectedPlan,
      },
    });
  } catch (err) {
    console.error('❌ Signup error:', err);
    return NextResponse.json(
      { success: false, error: 'Signup failed. Please try again.' },
      { status: 500 }
    );
  }
}
