// ═══════════════════════════════════════════════════════════
// 🗑️ Tenant Self-Service Data Deletion
// GDPR Article 17 / India DPDP Act 2023 — Right to Erasure
// ═══════════════════════════════════════════════════════════
// POST → queue a deletion request (30-day grace period)
// DELETE → cancel a pending request (by email-link ?code=, or by session)
// GET → check status (by ?code=, or by session)
//
// Hardening (2026-07-17): this previously authenticated with getTenantId()
// alone, so ANY team member — including 'staff' or 'viewer' roles — could
// trigger permanent deletion of the entire account. Full account closure is
// now owner-only and requires typing the exact business name. It also now
// actually stops the bot (tenants.is_active = false — the same flag the
// WhatsApp webhook's tenant lookup already requires) and cancels billing
// immediately, rather than continuing to run/charge through the 30-day
// grace period while "scheduled for deletion."
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { cancelSubscription } from '@/lib/billing/razorpay';
import { logAudit } from '@/lib/audit/logger';
import { notifyAdmin } from '@/lib/alerts/admin';
import { Resend } from 'resend';

const GRACE_DAYS = 30;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'owner') {
    return NextResponse.json({ error: 'Only the account owner can delete the account.' }, { status: 403 });
  }
  const tenantId = user.tenant_id;

  const body = await req.json().catch(() => ({}));
  const reason = (body.reason as string) || '';
  const confirmBusinessName = (body.confirmBusinessName as string) || '';

  const { data: tenant } = await supabaseAdmin
    .from('tenants').select('business_name, business_email').eq('id', tenantId).single();
  const email = (tenant?.business_email as string) || user.email;

  if (!tenant || confirmBusinessName.trim() !== tenant.business_name) {
    return NextResponse.json(
      { error: 'Business name confirmation does not match. Type your exact business name to confirm.' },
      { status: 400 }
    );
  }

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
      requested_by: user.id,
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

  // Stop the bot immediately — is_active gates the webhook's tenant lookup,
  // so this takes effect on the very next incoming message, not in 30 days.
  await supabaseAdmin.from('tenants').update({ is_active: false }).eq('id', tenantId);

  // Stop billing immediately — don't keep charging someone who asked to leave.
  try {
    await cancelSubscription(tenantId);
  } catch (billingErr) {
    console.error('⚠️ Failed to cancel subscription on account deletion request:', billingErr);
    await notifyAdmin({
      dedupeKey: `deletion-billing-cancel-failed:${tenantId}`,
      subject: 'Subscription cancellation failed during account deletion',
      summary: `Tenant ${tenantId} (${tenant.business_name}) requested account deletion but the Razorpay subscription cancel failed. Cancel it manually.`,
      context: { tenantId, error: String(billingErr) },
    });
  }

  logAudit({
    tenant_id: tenantId,
    actor_id: user.id,
    actor_email: user.email,
    action: 'account_deletion_requested',
    entity: 'tenant_account',
    entity_id: tenantId,
  });

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
            <p>Your AI assistant has been paused and your subscription cancelled effective immediately.</p>
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
    message: `Your data deletion has been scheduled. Your AI has been paused and billing cancelled. All data will be permanently deleted on ${new Date(scheduledFor).toLocaleDateString('en-IN')}. You have ${GRACE_DAYS} days to cancel.`,
    scheduledFor,
    confirmationCode: request.confirmation_code,
  });
}

// Cancel a pending deletion request — via email-link ?code=, or via an
// authenticated owner session (no code needed, for the dashboard button).
export async function DELETE(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');

  let requestRow: { id: string; status: string; tenant_id: string | null } | null = null;

  if (code) {
    const { data } = await supabaseAdmin
      .from('data_deletion_requests')
      .select('id, status, tenant_id')
      .eq('confirmation_code', code)
      .single();
    requestRow = data;
  } else {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'owner') {
      return NextResponse.json({ error: 'Only the account owner can cancel a deletion request.' }, { status: 403 });
    }
    const { data } = await supabaseAdmin
      .from('data_deletion_requests')
      .select('id, status, tenant_id')
      .eq('tenant_id', user.tenant_id)
      .eq('status', 'pending')
      .maybeSingle();
    requestRow = data;
  }

  if (!requestRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (requestRow.status !== 'pending') {
    return NextResponse.json({ error: `Cannot cancel — request is already ${requestRow.status}` }, { status: 400 });
  }

  await supabaseAdmin
    .from('data_deletion_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestRow.id);

  if (requestRow.tenant_id) {
    // Resume the bot — billing is intentionally NOT auto-resumed; the
    // subscription was cancelled outright and needs to be re-subscribed
    // from the billing page, a deliberate choice rather than a surprise charge.
    await supabaseAdmin.from('tenants').update({ is_active: true }).eq('id', requestRow.tenant_id);
    logAudit({
      tenant_id: requestRow.tenant_id,
      action: 'account_deletion_cancelled',
      entity: 'tenant_account',
      entity_id: requestRow.tenant_id,
    });
  }

  return NextResponse.json({ ok: true, message: 'Deletion request cancelled. Your data is safe and your AI assistant has resumed. You may need to re-subscribe on the Billing page.' });
}

// Check status by confirmation code, or by an authenticated session (for the
// dashboard to know whether to show a "pending deletion" banner).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');

  if (code) {
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

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: request } = await supabaseAdmin
    .from('data_deletion_requests')
    .select('status, scheduled_for, processed_at')
    .eq('tenant_id', user.tenant_id)
    .eq('status', 'pending')
    .maybeSingle();

  return NextResponse.json({
    status: request?.status ?? null,
    scheduledFor: request?.scheduled_for ?? null,
    processedAt: request?.processed_at ?? null,
  });
}
