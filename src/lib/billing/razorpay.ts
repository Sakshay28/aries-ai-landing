// ═══════════════════════════════════════════════════════════
// 💳 Razorpay Billing — Subscriptions & Webhooks
// ═══════════════════════════════════════════════════════════
// Handles plan subscriptions, payment verification, and
// webhook events (payment success, failure, cancellation).
// ═══════════════════════════════════════════════════════════

import Razorpay from 'razorpay';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_DETAILS } from '@/lib/types';
import type { Plan } from '@/lib/types';

let _razorpay: Razorpay | null = null;
export function getRazorpay(): Razorpay {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }
  return _razorpay;
}

// Razorpay plan IDs (create these in Razorpay Dashboard)
const RAZORPAY_PLAN_IDS: Record<Plan, string> = {
  starter: process.env.RAZORPAY_PLAN_STARTER || '',
  growth: process.env.RAZORPAY_PLAN_GROWTH || '',
  pro: process.env.RAZORPAY_PLAN_PRO || '',
  enterprise: '', // Custom — handled manually
};

// ═══════════════════════════════════════
// Create Subscription for a Tenant
// ═══════════════════════════════════════
export async function createSubscription(tenantId: string, plan: Plan, customerEmail: string) {
  const planId = RAZORPAY_PLAN_IDS[plan];
  if (!planId) throw new Error(`No Razorpay plan configured for: ${plan}`);

  // Create or get Razorpay customer
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('razorpay_customer_id, business_name, business_email, business_phone')
    .eq('id', tenantId)
    .single();

  let customerId = tenant?.razorpay_customer_id;

  if (!customerId) {
    const customer = await getRazorpay().customers.create({
      name: tenant?.business_name || 'Client',
      email: customerEmail || tenant?.business_email || '',
    });
    customerId = customer.id;

    await supabaseAdmin
      .from('tenants')
      .update({ razorpay_customer_id: customerId })
      .eq('id', tenantId);
  }

  // Create subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscription = await (getRazorpay().subscriptions.create as any)({
    plan_id: planId,
    total_count: 120, // 10 years of monthly billing
    customer_id: customerId,
    notify_info: {
      notify_phone: tenant?.business_phone || '',
      notify_email: customerEmail || tenant?.business_email || '',
    },
  });

  // Update tenant with subscription ID
  await supabaseAdmin
    .from('tenants')
    .update({
      razorpay_subscription_id: subscription.id,
      plan,
      plan_status: 'active',
      message_limit: PLAN_DETAILS[plan].messageLimit,
      ai_conversation_limit: PLAN_DETAILS[plan].aiConversationLimit,
    })
    .eq('id', tenantId);

  return {
    subscriptionId: subscription.id as string,
    shortUrl: subscription.short_url as string,
    status: subscription.status as string,
  };
}

// ═══════════════════════════════════════
// Verify Payment Signature
// ═══════════════════════════════════════
export function verifyPaymentSignature(
  subscriptionId: string,
  paymentId: string,
  signature: string
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET!;
  const generated = crypto
    .createHmac('sha256', secret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex');

  return generated === signature;
}

// ═══════════════════════════════════════
// Verify Webhook Signature
// ═══════════════════════════════════════
export function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
  const generated = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return generated === signature;
}

// ═══════════════════════════════════════
// Handle Webhook Events
// ═══════════════════════════════════════
export async function handleRazorpayWebhook(event: string, payload: Record<string, unknown>) {
  const entity = (payload.subscription as Record<string, unknown>) ||
                 (payload.payment as Record<string, unknown>) || {};
  const subscriptionId = (entity.id as string) || (entity.subscription_id as string);

  if (!subscriptionId) {
    console.warn('⚠️ Razorpay webhook: no subscription ID found');
    return;
  }

  // Find tenant by subscription ID
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, business_name')
    .eq('razorpay_subscription_id', subscriptionId)
    .single();

  if (!tenant) {
    console.warn(`⚠️ Razorpay webhook: no tenant for subscription ${subscriptionId}`);
    return;
  }

  switch (event) {
    case 'subscription.activated':
      await supabaseAdmin
        .from('tenants')
        .update({ plan_status: 'active' })
        .eq('id', tenant.id);
      console.log(`💳 [${tenant.business_name}] Subscription activated`);
      break;

    case 'subscription.charged':
      // Monthly payment successful — reset usage counters
      await supabaseAdmin
        .from('tenants')
        .update({
          plan_status: 'active',
          messages_used_this_month: 0,
          ai_conversations_this_month: 0,
          current_billing_period_start: new Date().toISOString(),
        })
        .eq('id', tenant.id);
      console.log(`💳 [${tenant.business_name}] Monthly payment received`);
      break;

    case 'subscription.pending':
      await supabaseAdmin
        .from('tenants')
        .update({ plan_status: 'past_due' })
        .eq('id', tenant.id);
      console.log(`⚠️ [${tenant.business_name}] Payment pending`);
      break;

    case 'subscription.halted':
    case 'subscription.cancelled':
      await supabaseAdmin
        .from('tenants')
        .update({ plan_status: 'cancelled', is_active: false })
        .eq('id', tenant.id);
      console.log(`❌ [${tenant.business_name}] Subscription cancelled`);
      break;

    default:
      console.log(`📋 Razorpay event: ${event} for ${tenant.business_name}`);
  }

  // Log the event
  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenant.id,
    event_type: `billing_${event}`,
    channel: 'razorpay',
    metadata: { event, subscription_id: subscriptionId },
  });
}

// ═══════════════════════════════════════
// Cancel Subscription
// ═══════════════════════════════════════
export async function cancelSubscription(tenantId: string) {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('razorpay_subscription_id')
    .eq('id', tenantId)
    .single();

  if (tenant?.razorpay_subscription_id) {
    await getRazorpay().subscriptions.cancel(tenant.razorpay_subscription_id);
  }

  await supabaseAdmin
    .from('tenants')
    .update({ plan_status: 'cancelled' })
    .eq('id', tenantId);
}

// ═══════════════════════════════════════
// Change Plan
// ═══════════════════════════════════════
export async function changePlan(tenantId: string, newPlan: Plan, customerEmail: string) {
  // Cancel existing subscription
  await cancelSubscription(tenantId);

  // Create new subscription with new plan
  return createSubscription(tenantId, newPlan, customerEmail);
}
