// ═══════════════════════════════════════════════════════════
// 📧 Send Signup/Login OTP via Resend (bypasses Supabase SMTP)
// ═══════════════════════════════════════════════════════════
// Generates the OTP server-side with the Supabase admin API and
// delivers it through Resend — which we control via RESEND_API_KEY.
// This removes the dependency on Supabase's built-in SMTP, which
// was failing with "Error sending magic link email".
//
// The 8-digit code returned here is verified by the EXISTING
// /api/auth/verify-otp route with type: 'email' (tested working).
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('Invalid email address'),
  fullName: z.string().trim().max(120).optional(),
  businessName: z.string().trim().max(120).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
    const rl = await checkRedisRateLimit(`send-otp:${ip}`, 8, 3600); // 8/hr per IP
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please wait a bit and try again.' },
        { status: 429 }
      );
    }

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { email, fullName, businessName } = parsed.data;

    // 1. Ensure an auth user exists (passwordless). Ignore "already registered".
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        ...(fullName ? { full_name: fullName } : {}),
        ...(businessName ? { business_name: businessName } : {}),
      },
    });
    if (createErr && !/already.*registered|already.*been|exists/i.test(createErr.message)) {
      console.error('send-otp createUser error:', createErr.message);
      return NextResponse.json({ success: false, error: 'Could not start signup. Please try again.' }, { status: 500 });
    }

    // 2. Generate the OTP server-side
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr || !linkData?.properties?.email_otp) {
      console.error('send-otp generateLink error:', linkErr?.message);
      return NextResponse.json({ success: false, error: 'Could not generate verification code.' }, { status: 500 });
    }
    const otp = linkData.properties.email_otp;

    // 3. Send via Resend (we control this — no Supabase SMTP involved)
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('send-otp: RESEND_API_KEY not set');
      return NextResponse.json({ success: false, error: 'Email service not configured.' }, { status: 500 });
    }

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const greeting = fullName ? `Hi ${fullName.split(' ')[0]},` : 'Hi,';
    const { error: sendErr } = await resend.emails.send({
      from: 'AriesAI <noreply@ariesai.in>',
      to: email,
      subject: `${otp} is your AriesAI verification code`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff">
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px">${greeting}</h2>
          <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px">
            Your verification code for <strong>AriesAI</strong> is:
          </p>
          <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#128C7E;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px;text-align:center;margin-bottom:24px">
            ${otp}
          </div>
          <p style="color:#888;font-size:13px;line-height:1.6">
            This code expires in 1 hour. If you didn't request it, you can ignore this email.
          </p>
        </div>
      `,
      text: `Your AriesAI verification code is ${otp}. It expires in 1 hour.`,
    });

    if (sendErr) {
      console.error('send-otp Resend send error:', sendErr);
      // TEMP DIAGNOSTIC — fingerprint the key (no full secret) + real Resend error
      const k = apiKey || '';
      const fp = `${k.slice(0, 6)}…${k.slice(-4)} len=${k.length}`;
      return NextResponse.json(
        {
          success: false,
          error: 'Could not send verification email. Please try again or use Google sign-up.',
          _debug: { resendError: sendErr, keyFingerprint: fp, from: 'noreply@ariesai.in' },
        },
        { status: 502 }
      );
    }

    console.log(`📧 OTP sent via Resend to ${email}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('send-otp route error:', err);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
