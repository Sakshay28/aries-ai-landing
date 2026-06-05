// ═══════════════════════════════════════════════════════════
// 🗑️ Tenant Self-Service Data Deletion
// GDPR Article 17 / India DPDP Act 2023 — Right to Erasure
// ═══════════════════════════════════════════════════════════
// POST → queue a deletion request (30-day grace period)
// DELETE → cancel a pending request
// GET → check status

import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Resend } from 'resend';

const GRACE_DAYS = 30;

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const reason = (body.reason as string) || '';

  // Get requesting user
  const { data: tenant } = await supabaseAdmin
    .from('tenants').select('business_name, business_email').eq('id', tenantId).single();
  const email = (tenant?.business_email as string) || '';

  // Check if a pending request already exists
  const { data: existing } = await supabaseAdmin
    .from('data_deletion_requests')
    .select('id, scheduled_for, confirmation_code')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: true,
      message: 'A deletion request is already pending.',
      scheduledFor: existing.scheduled_for,
      confirmationCode: existing.confirmation_code,
    });
  }

  const scheduledFor = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: request, error } = await supabaseAdmin
    .from('data_deletion_requests')
    .insert({
      tenant_id:   tenantId,
      email,
      reason,
      status:      'pending',
      scheduled_for: scheduledFor,
    })
    .select()
    .single();

  if (error || !request) {
    return NextResponse.json({ error: 'Failed to create deletion request' }, { status: 500 });
  }

  // Send confirmation email
  if (email) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/dashboard/data-deletion?code=${request.confirmation_code}`;
      await resend.emails.send({
        from: 'AriesAI <noreply@ariesai.in>',
        to: email,
        subject: `[Action Required] Your data deletion request — ${GRACE_DAYS}-day grace period`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px">
            <h2 style="color:#111">Data Deletion Request Received</h2>
            <p>We've received a request to permanently delete all data for <strong>${tenant?.business_name || 'your account'}</strong>.</p>
            <p><strong>Scheduled for:</strong> ${new Date(scheduledFor).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p>All leads, conversations, messages, bookings, and settings will be permanently deleted. This action is irreversible.</p>
            <p>If this was a mistake, you can cancel the request by clicking below:</p>
            <a href="${cancelUrl}" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
              Cancel Deletion Request
            </a>
            <p style="color:#888;font-size:13px">Confirmation code: ${request.confirmation_code}</p>
          </div>
        `,
      });
    } catch (e) {
      console.warn('⚠️ Failed to send deletion confirmation email:', e);
    }
  }

  return NextResponse.json({
    ok: true,
    message: `Your data deletion has been scheduled. All data will be deleted on ${new Date(scheduledFor).toLocaleDateString('en-IN')}. You have ${GRACE_DAYS} days to cancel.`,
    scheduledFor,
    confirmationCode: request.confirmation_code,
  });
}

// Cancel a pending deletion request
export async function DELETE(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Missing confirmation code' }, { status: 400 });

  const { data: request } = await supabaseAdmin
    .from('data_deletion_requests')
    .select('id, status, tenant_id')
    .eq('confirmation_code', code)
    .single();

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (request.status !== 'pending') {
    return NextResponse.json({ error: `Cannot cancel — request is already ${request.status}` }, { status: 400 });
  }

  await supabaseAdmin
    .from('data_deletion_requests')
    .update({ status: 'cancelled' })
    .eq('id', request.id);

  return NextResponse.json({ ok: true, message: 'Deletion request cancelled. Your data is safe.' });
}

// Check status by confirmation code
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const { data: request } = await supabaseAdmin
    .from('data_deletion_requests')
    .select('status, scheduled_for, processed_at')
    .eq('confirmation_code', code)
    .single();

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    status: request.status,
    scheduledFor: request.scheduled_for,
    processedAt: request.processed_at,
  });
}
