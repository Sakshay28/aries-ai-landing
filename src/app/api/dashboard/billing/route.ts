import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRazorpay } from '@/lib/billing/razorpay';

export async function GET() {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('plan, plan_status, razorpay_subscription_id')
      .eq('id', tenantId)
      .single();

    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    if (!tenant.razorpay_subscription_id) {
      return NextResponse.json({ success: true, data: { plan: tenant.plan, status: tenant.plan_status, invoices: [] } });
    }

    const subscription = await getRazorpay().subscriptions.fetch(tenant.razorpay_subscription_id);
    const invoices = await getRazorpay().invoices.all({ subscription_id: tenant.razorpay_subscription_id });

    return NextResponse.json({
      success: true,
      data: {
        plan: tenant.plan,
        status: tenant.plan_status,
        next_billing_date: subscription.charge_at ? new Date(subscription.charge_at * 1000).toISOString() : null,
        invoices: invoices.items.map(inv => ({
          id: inv.id,
          amount: (inv.amount as number) / 100,
          status: inv.status,
          date: new Date((inv.issued_at as number) * 1000).toISOString(),
          pdf_url: inv.short_url
        }))
      }
    });
  } catch (error: any) {
    console.error('Billing fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
