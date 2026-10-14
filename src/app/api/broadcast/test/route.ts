import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { TestSendService } from '@/lib/broadcast/services/test-send.service';
import { VariableConfig } from '@/app/dashboard/broadcast/types';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { z } from 'zod';

const TestSchema = z.object({
  campaignId: z.string().uuid(),
  phoneNumber: z.string().min(10),
  recipientName: z.string().optional(),
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

    const { campaignId, phoneNumber, recipientName } = parsed.data;

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

    const variables: Record<string, VariableConfig> = {};
    for (const mapping of (mappings || [])) {
      variables[mapping.variable_key] = {
        index: mapping.variable_key,
        sourceType: mapping.source_type,
        crmField: mapping.crm_field || undefined,
        staticValue: mapping.custom_value || undefined,
      };
    }

    const detectedVarIndices = Object.keys(variables).sort((a, b) => Number(a) - Number(b));

    console.log(`[broadcast] [test] Dispatching test template message to ${phoneNumber} for campaign ${campaignId}`);

    // 4. Send test message via TestSendService (supports headers & COPY_CODE buttons)
    const result = await TestSendService.sendTest(
      tenantId,
      campaign.template_name,
      variables,
      detectedVarIndices,
      phoneNumber,
      campaign.template_language || 'en',
      campaign.header_media_url || undefined,
      recipientName
    );

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
