// ═══════════════════════════════════════════════════════════
// ⚙️ Settings API — Save Bot Configuration to Supabase
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateCache } from '@/lib/tenant/manager';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select(`
      business_name, business_type, business_phone, business_address,
      business_website, business_email, bot_name, bot_personality,
      welcome_message, welcome_offer, usps, working_hours,
      staff_phone, staff_name, manager_phone,
      followup_30min, followup_3hr, followup_24hr, followup_7day,
      escalation_timeout_mins, hot_keywords, warm_keywords,
      custom_faqs, off_hours_message, off_hours_capture_lead
    `)
    .eq('id', tenantId)
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// PATCH /api/dashboard/settings — Update settings
export async function PATCH(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  // Whitelist allowed fields to prevent updating sensitive data
  const allowedFields = [
    'business_name', 'business_type', 'business_phone', 'business_address',
    'business_website', 'business_email', 'bot_name', 'bot_personality',
    'welcome_message', 'welcome_offer', 'usps', 'working_hours',
    'staff_phone', 'staff_name', 'manager_phone',
    'followup_30min', 'followup_3hr', 'followup_24hr', 'followup_7day',
    'escalation_timeout_mins', 'hot_keywords', 'warm_keywords',
    'custom_faqs', 'off_hours_message', 'off_hours_capture_lead',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update(updates)
    .eq('id', tenantId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Invalidate cached tenant config so changes take effect immediately
  await invalidateCache(tenantId);

  return NextResponse.json({ success: true, data });
}
