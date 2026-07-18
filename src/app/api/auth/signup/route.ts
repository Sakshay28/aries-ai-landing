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
import { recordConsent } from '@/lib/legal/consent';
import { z } from 'zod';

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  businessName: z.string().min(2, 'Business name must be at least 2 characters').max(100),
  businessType: z.string().optional(),
  plan: z.enum(['starter', 'growth', 'pro', 'enterprise']).optional(),
  brand: z.enum(['aries', 'libra']).optional(),
  consentAccepted: z.literal(true, {
    message: 'You must accept the Terms of Service and Privacy Policy to continue.',
  }),
});

// ═══════════════════════════════════════
// POST /api/auth/signup — New user + tenant
// ═══════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
             || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
             || 'unknown-ip';
    const rateLimit = await checkRedisRateLimit(`signup:${ip}`, 5, 3600); // 5 attempts per hour per IP
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many signup attempts. Try again later.' }, { status: 429 });
    }

    let parsedBody;
    try {
      const rawBody = await req.json();
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
      email_confirm: false, // Require email verification
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

    // A tenant created without a provable consent record is a compliance
    // gap — roll the whole signup back rather than let it silently succeed.
    try {
      await recordConsent({
        tenantId: tenant.id,
        email,
        ip,
        userAgent: req.headers.get('user-agent'),
        source: 'password_signup',
      });
    } catch (consentErr) {
      console.error('❌ Signup: consent recording failed, rolling back', consentErr);
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUser.id);
        await supabaseAdmin.from('users').delete().eq('tenant_id', tenant.id);
        await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      } catch (cleanupErr) {
        console.error('❌ Signup rollback (consent failure) failed — orphan tenant/user may exist:', cleanupErr);
      }
      return NextResponse.json(
        { success: false, error: 'Failed to record consent. Please try again.' },
        { status: 500 }
      );
    }

    // 4. Send email verification link via Resend
    let verificationSent = false;
    try {
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'signup',
        email,
        password,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=/dashboard`,
        },
      });

      if (linkData?.properties?.action_link) {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'AriesAI <noreply@ariesai.in>',
          to: email,
          subject: 'Verify your AriesAI account',
          html: `
            <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff">
              <img src="https://ariesai.in/logo.png" alt="AriesAI" style="height:36px;margin-bottom:24px" />
              <h2 style="font-size:22px;font-weight:700;color:#111;margin-bottom:8px">Welcome to AriesAI, ${fullName}!</h2>
              <p style="color:#555;font-size:15px;line-height:1.6;margin-bottom:24px">
                Your account for <strong>${businessName}</strong> is almost ready.
                Click the button below to verify your email address and get started.
              </p>
              <a href="${linkData.properties.action_link}" style="display:inline-block;background:#25D366;color:#fff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:24px">
                Verify Email →
              </a>
              <p style="color:#888;font-size:13px;margin-top:16px">
                This link expires in 24 hours. If you didn't sign up for AriesAI, ignore this email.
              </p>
            </div>
          `,
        });
        verificationSent = true;
      }
    } catch (verifyErr) {
      // Non-fatal — user can request resend
      console.error('⚠️ Failed to send verification email:', verifyErr);
    }

    // 5. Log event (fire-and-forget)
    supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenant.id,
      event_type: 'user_signup',
      metadata: { email, plan: selectedPlan, verificationSent },
    }).then(({ error: e }) => { if (e) console.warn('analytics_events insert failed (non-fatal):', e.message); });

    console.log(`🎉 New signup: ${businessName} — ${selectedPlan} plan — verification sent: ${verificationSent}`);

    return NextResponse.json({
      success: true,
      requiresEmailVerification: true,
      verificationSent,
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
