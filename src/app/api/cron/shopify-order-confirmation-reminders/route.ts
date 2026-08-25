// ═══════════════════════════════════════════════════════════
// ⏰ Order-Confirmation "Change Details" Reminder
// Finds Shopify orders where the customer tapped "Change Details" over 1h
// ago and never sent their corrected info — nudges them once. See
// src/lib/shopify/orderConfirmationCopy.ts and the inbound-reply intercept
// in src/app/api/webhooks/whatsapp/route.ts (the reminder window reopened
// by their own button tap, so this is a plain session message, not a Meta
// template).
//
// NOT in vercel.json — this needs ~15min granularity and Vercel Hobby
// rejects any cron more frequent than daily (deploy-time hard error, learned
// the hard way earlier in this session). Triggered by Supabase pg_cron
// instead, the same workaround already used for automation_queue draining
// (see the commented block at the end of
// supabase/migrations/20260813b_order_confirmation_copy_and_reminders.sql).
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTextMessage } from '@/lib/meta/service';
import { decryptTokenV2 } from '@/lib/security/keyManager';
import { greetingName } from '@/lib/utils/contact-name';
import { renderOrderConfirmationCopy } from '@/lib/shopify/orderConfirmationCopy';

export const maxDuration = 60;

// 30 minutes — earlier of the two options Devprayagjal proposed ("30 min or
// 1 hr"). Catches customers before they lose context on the tap and reduces
// abandonment. If a tenant wants a different delay later, promote this to a
// tenant column rather than adding branches here.
const REMINDER_DELAY_MS = 30 * 60 * 1000;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - REMINDER_DELAY_MS).toISOString();

  const { data: pending } = await supabaseAdmin
    .from('shopify_orders')
    .select('id, tenant_id, shopify_id, order_number, phone, lead_id')
    .eq('confirmation_status', 'change_requested')
    .is('change_reminder_sent_at', null)
    .lte('confirmation_responded_at', cutoff)
    .not('phone', 'is', null)
    .limit(200);

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const byTenant = new Map<string, typeof pending>();
  for (const o of pending) {
    const arr = byTenant.get(o.tenant_id as string) || [];
    arr.push(o);
    byTenant.set(o.tenant_id as string, arr);
  }

  let sent = 0;
  let skipped = 0;

  for (const [tenantId, orders] of byTenant) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_phone_number_id, shopify_order_confirmation_enabled, shopify_order_confirmation_copy')
      .eq('id', tenantId)
      .maybeSingle();

    if (!tenant?.shopify_order_confirmation_enabled || !tenant.wa_access_token || !tenant.wa_phone_number_id) {
      skipped += orders.length;
      continue;
    }
    const token = decryptTokenV2(tenant.wa_access_token as string);
    if (!token) { skipped += orders.length; continue; }
    const phoneNumberId = tenant.wa_phone_number_id as string;

    for (const o of orders) {
      const orderLabel = o.order_number || `#${o.shopify_id}`;
      const leadName = o.lead_id
        ? (await supabaseAdmin.from('leads').select('name').eq('id', o.lead_id).maybeSingle()).data?.name
        : null;
      const text = renderOrderConfirmationCopy(tenant, 'change_reminder', {
        customer_name: greetingName(leadName || null),
        order_id: String(orderLabel),
      });

      try {
        await sendTextMessage(token, phoneNumberId, o.phone as string, text);
        await supabaseAdmin.from('shopify_orders')
          .update({ change_reminder_sent_at: new Date().toISOString() })
          .eq('id', o.id);
        sent++;
      } catch (e) {
        console.error(`[order-confirmation-reminders] send failed for order ${o.id}:`, (e as Error).message);
        skipped++;
      }
    }
  }

  console.log(`⏰ [order-confirmation-reminders] sent=${sent} skipped=${skipped}`);
  return NextResponse.json({ ok: true, sent, skipped });
}
