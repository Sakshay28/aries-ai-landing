import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendMessage';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { z } from 'zod';

const TestSchema = z.object({
  campaignId: z.string().uuid(),
  phoneNumber: z.string().min(10),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Auth & Scoping
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = TestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ 
        success: false, 
        error: 'campaignId (UUID) and phoneNumber (minimum 10 characters) are required',
        details: parsed.error.flatten() 
      }, { status: 400 });
    }

    const { campaignId, phoneNumber } = parsed.data;

    // Rate-limit test sends: 10 per tenant per hour to prevent quota abuse
    const rl = await checkRedisRateLimit(`broadcast:test:${tenantId}`, 10, 3600);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Test send rate limit reached (10/hour). Try again later.' }, { status: 429 });
    }

    // 2. Fetch campaign and verify tenant scope
    const { data: campaign, error: campaignErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (campaignErr || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    // 3. Fetch variable mappings to populate test values
    const { data: mappings } = await supabaseAdmin
      .from('broadcast_variable_mapping')
      .select('*')
      .eq('campaign_id', campaignId);

    const resolvedVars: Record<string, string> = {};
    for (const mapping of (mappings || [])) {
      if (mapping.source_type === 'static') {
        resolvedVars[mapping.variable_key] = mapping.custom_value || '';
      } else if (mapping.source_type === 'crm_field') {
        const field = mapping.crm_field?.toLowerCase() || '';
        if (field.includes('name')) resolvedVars[mapping.variable_key] = 'Test Name';
        else if (field.includes('email')) resolvedVars[mapping.variable_key] = 'test@example.com';
        else if (field.includes('phone')) resolvedVars[mapping.variable_key] = phoneNumber;
        else resolvedVars[mapping.variable_key] = `[${mapping.crm_field}]`;
      } else {
        resolvedVars[mapping.variable_key] = mapping.custom_value || `[${mapping.variable_key}]`;
      }
    }

    console.log(`[broadcast] [test] Dispatching test template message to ${phoneNumber} for campaign ${campaignId}`);

    // 4. Send test message via WhatsApp API
    const result = await sendWhatsAppMessage({
      to: phoneNumber,
      templateName: campaign.template_name,
      languageCode: campaign.template_language || 'en',
      variables: resolvedVars,
      tenantId,
    });

    if (!result.success) {
      console.error(`[broadcast] [test] WhatsApp test dispatch failed:`, result.error);
      return NextResponse.json({ success: false, error: result.error || 'Failed to send WhatsApp message' }, { status: 502 });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });

  } catch (error: any) {
    console.error('[broadcast] [test] API Exception:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
