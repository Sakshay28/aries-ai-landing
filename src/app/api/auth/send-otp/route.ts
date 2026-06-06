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
    const firstName = fullName ? fullName.split(' ')[0] : '';
    const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
    // Space the digits for readability in the box (keeps raw OTP in the subject/text)
    const spacedOtp = String(otp).split('').join('&nbsp;');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Your AriesAI verification code</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;-webkit-font-smoothing:antialiased;">
  <!-- preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your AriesAI verification code is ${otp}. It expires in 1 hour.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #eaecef;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
          <!-- Header -->
          <tr>
            <td style="background-color:#0c0e14;padding:26px 32px;text-align:center;">
              <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;line-height:1;">Aries<span style="color:#25D366;">AI</span></span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 8px 32px;">
              <h1 style="margin:0 0 6px 0;font-size:20px;font-weight:700;color:#111827;">${greeting}</h1>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#4b5563;">
                Use the verification code below to continue setting up your AriesAI account. It's valid for the next hour.
              </p>
              <!-- OTP box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:22px 0;">
                    <div style="font-size:34px;font-weight:800;letter-spacing:6px;color:#128C7E;font-family:'SF Mono',Menlo,Consolas,monospace;">${spacedOtp}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#9ca3af;">
                If you didn't request this code, you can safely ignore this email — no changes will be made to your account.
              </p>
            </td>
          </tr>
          <!-- Divider -->
          <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #eef0f2;margin:28px 0 0 0;"></td></tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 32px 32px;text-align:center;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#111827;">AriesAI</p>
              <p style="margin:0 0 12px 0;font-size:12px;line-height:1.6;color:#9ca3af;">AI-powered WhatsApp automation for growing businesses.</p>
              <p style="margin:0;font-size:11px;color:#c0c4cb;">© ${new Date().getFullYear()} AriesAI · This is an automated message, please don't reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const { error: sendErr } = await resend.emails.send({
      from: 'AriesAI <noreply@ariesai.in>',
      to: email,
      subject: `${otp} is your AriesAI verification code`,
      html,
      text: `${greeting}\n\nYour AriesAI verification code is: ${otp}\n\nThis code expires in 1 hour. If you didn't request it, you can ignore this email.\n\n— AriesAI`,
    });

    if (sendErr) {
      console.error('send-otp Resend send error:', sendErr);
      return NextResponse.json(
        { success: false, error: 'Could not send verification email. Please try again or use Google sign-up.' },
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
