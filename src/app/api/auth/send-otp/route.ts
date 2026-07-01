// ═══════════════════════════════════════════════════════════
// 📧 Send OTP via Resend (login + signup — bypasses Supabase SMTP)
// ═══════════════════════════════════════════════════════════
// Generates the OTP server-side via the Supabase admin API and
// delivers it through Resend (RESEND_API_KEY). This removes the
// dependency on Supabase's built-in SMTP, which was silently
// failing with "Error sending magic link email".
//
// Used by both /login and /signup pages.
// For login: email only (no fullName/businessName).
// For signup: includes fullName + businessName for the welcome email.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { logAuthEvent } from '@/lib/auth/events';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('Invalid email address').transform(v => v.toLowerCase().trim()),
  fullName: z.string().trim().max(120).optional(),
  businessName: z.string().trim().max(120).optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
           || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           || 'unknown-ip';

  try {
    // Rate limit: 8 OTP sends per IP per hour + 5 per email per hour
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { email, fullName, businessName } = parsed.data;

    const [ipLimit, emailLimit] = await Promise.all([
      checkRedisRateLimit(`send-otp:ip:${ip}`, 8, 3600),
      checkRedisRateLimit(`send-otp:email:${email}`, 5, 3600),
    ]);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      await logAuthEvent('otp_send_rate_limited', email, ip, {});
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please wait an hour and try again.' },
        { status: 429 }
      );
    }

    await logAuthEvent('otp_requested', email, ip, {});

    // Ensure an auth user exists. For login, the user should already exist.
    // For signup, create if absent. Ignore "already registered" errors.
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        ...(fullName ? { full_name: fullName } : {}),
        ...(businessName ? { business_name: businessName } : {}),
      },
    });
    if (createErr && !/already.*registered|already.*been|already.*exist|in use/i.test(createErr.message)) {
      console.error('send-otp createUser error:', createErr.message);
      await logAuthEvent('otp_send_failed', email, ip, { step: 'createUser', error: createErr.message });
      return NextResponse.json({ success: false, error: 'Could not start verification. Please try again.' }, { status: 500 });
    }

    // Generate the OTP server-side via admin API
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr || !linkData?.properties?.email_otp) {
      console.error('send-otp generateLink error:', linkErr?.message);
      await logAuthEvent('otp_send_failed', email, ip, { step: 'generateLink', error: linkErr?.message });
      return NextResponse.json({ success: false, error: 'Could not generate verification code. Please try again.' }, { status: 500 });
    }
    const otp = linkData.properties.email_otp;

    // Send via Resend — we control this delivery pipeline
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('send-otp: RESEND_API_KEY not set');
      await logAuthEvent('otp_send_failed', email, ip, { step: 'resend_key_missing' });
      return NextResponse.json({ success: false, error: 'Email service not configured. Please contact support.' }, { status: 500 });
    }

    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const firstName = fullName ? fullName.split(' ')[0] : '';
    const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
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
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your AriesAI verification code is ${otp}. It expires in 1 hour.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #eaecef;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
          <tr>
            <td style="background-color:#0c0e14;padding:26px 32px;text-align:center;">
              <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;line-height:1;">Aries<span style="color:#25D366;">AI</span></span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 8px 32px;">
              <h1 style="margin:0 0 6px 0;font-size:20px;font-weight:700;color:#111827;">${greeting}</h1>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#4b5563;">
                Use the verification code below to sign in to your AriesAI account. It's valid for the next hour.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:22px 0;">
                    <div style="font-size:34px;font-weight:800;letter-spacing:6px;color:#128C7E;font-family:'SF Mono',Menlo,Consolas,monospace;">${spacedOtp}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#9ca3af;">
                If you didn't request this code, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #eef0f2;margin:28px 0 0 0;"></td></tr>
          <tr>
            <td style="padding:20px 32px 32px 32px;text-align:center;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#111827;">AriesAI</p>
              <p style="margin:0 0 12px 0;font-size:12px;line-height:1.6;color:#9ca3af;">AI-powered WhatsApp automation for growing businesses.</p>
              <p style="margin:0;font-size:11px;color:#c0c4cb;">© ${new Date().getFullYear()} AriesAI · Automated message, please don't reply.</p>
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
      await logAuthEvent('otp_send_failed', email, ip, { step: 'resend_send', error: String(sendErr) });
      return NextResponse.json(
        { success: false, error: 'Could not send verification email. Please try again or use Google sign-in.' },
        { status: 502 }
      );
    }

    await logAuthEvent('otp_sent', email, ip, {});
    console.log(`📧 OTP sent via Resend to ${email}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('send-otp route error:', err);
    await logAuthEvent('otp_send_failed', '', ip, { step: 'unexpected', error: String(err) }).catch(() => {});
    return NextResponse.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
