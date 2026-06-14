import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';

const campaignSaveSchema = z.object({
  campaignId: z.string().uuid().nullable().optional(),
  campaignName: z.string().trim().min(1).max(200),
  templateName: z.string().max(200).optional(),
  templateCategory: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).optional(),
  templateLanguage: z.string().max(10).optional(),
  deliveryMode: z.enum(['now', 'scheduled', 'recurring']).optional(),
  scheduledAt: z.string().nullable().optional(),
  audience: z.object({
    type: z.enum(['all', 'tags', 'custom', 'retarget', 'csv', 'manual']),
    tags: z.array(z.string()).optional(),
    customFilters: z.array(z.any()).optional(),
    retargetCampaignId: z.string().nullable().optional(),
    retargetCondition: z.string().optional(),
    retargetDelayDays: z.number().optional(),
    manualContactIds: z.array(z.string()).optional(),
    excludedContactIds: z.array(z.string()).optional(),
    csvFile: z.any().nullable().optional(),
  }).optional(),
  delivery: z.object({
    mode: z.enum(['now', 'scheduled', 'recurring']),
    throttleRate: z.number().min(1).max(5000).optional(),
    quietHoursEnabled: z.boolean().optional(),
    timezone: z.string().max(50).optional(),
  }).optional(),
  variables: z.record(z.string(), z.any()).optional(),
  automationRules: z.array(z.any()).optional(),
});

export async function DELETE(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('id');

    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaign id required' }, { status: 400 });
    }

    // Fetch status before deleting — cannot delete an active campaign mid-send
    const { data: campaign } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('status')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'sending' || campaign.status === 'scheduled' || campaign.status === 'launching') {
      return NextResponse.json({
        success: false,
        error: `Cannot delete a campaign in "${campaign.status}" state. Cancel it first.`,
      }, { status: 409 });
    }

    const { error } = await supabaseAdmin
      .from('broadcast_campaigns')
      .delete()
      .eq('id', campaignId)
      .eq('tenant_id', tenantId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[BROADCAST_DELETE] Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message || 'Failed to delete campaign' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('id');

    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaign id required' }, { status: 400 });
    }

    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (campErr || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, campaign });
  } catch (error) {
    console.error('API Campaign GET Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = campaignSaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid request body' }, { status: 400 });
    }
    const {
      campaignId,
      campaignName,
      templateName,
      templateCategory,
      templateLanguage,
      deliveryMode,
      scheduledAt,
      audience,
      delivery,
      variables,
      automationRules
    } = parsed.data;

    console.log('[BROADCAST_SAVE] Saving campaign:', { campaignId, campaignName, templateName });

    const campaignPayload = {
      tenant_id:         tenantId,
      name:              campaignName,
      template_name:     templateName || '',
      template_category: templateCategory || 'MARKETING',
      template_language: templateLanguage || 'en',
      delivery_mode:     deliveryMode || 'now',
      scheduled_for:     scheduledAt || null,
      status:            'draft',
      updated_at:        new Date().toISOString(),
    };

    let activeId = campaignId;

    if (activeId) {
      const { error } = await supabaseAdmin
        .from('broadcast_campaigns')
        .update(campaignPayload)
        .eq('id', activeId)
        .eq('tenant_id', tenantId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseAdmin
        .from('broadcast_campaigns')
        .insert({
          ...campaignPayload,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();
      if (error) throw error;
      activeId = data.id;
    }

    // Save Variable Mapping
    if (variables) {
      await supabaseAdmin
        .from('broadcast_variable_mapping')
        .delete()
        .eq('campaign_id', activeId);

      const variablesPayload = Object.entries(variables).map(([key, v]: [string, any]) => ({
        tenant_id: tenantId,
        campaign_id: activeId,
        variable_key: key,
        source_type: v.sourceType,
        crm_field: v.crmField || null,
        custom_value: v.staticValue || null
      }));

      if (variablesPayload.length > 0) {
        const { error } = await supabaseAdmin
          .from('broadcast_variable_mapping')
          .insert(variablesPayload);
        if (error) throw error;
      }
    }

    // Save Audience
    if (audience) {
      const audiencePayload = {
        tenant_id: tenantId,
        campaign_id: activeId,
        audience_type: audience.type,
        contact_count: 0,
        tag_ids: audience.tags || [],
        csv_upload_id: audience.type === 'csv' || audience.type === 'retarget' ? audience.retargetCampaignId : null,
        filters: {
          customFilters: audience.customFilters || [],
          retargetCondition: audience.retargetCondition || 'unread',
          retargetDelayDays: audience.retargetDelayDays || 1,
          manualContactIds: audience.manualContactIds || [],
          excludedContactIds: audience.excludedContactIds || [],
          csvFile: audience.csvFile || null
        }
      };

      const { error } = await supabaseAdmin
        .from('broadcast_audiences')
        .upsert(audiencePayload, { onConflict: 'campaign_id' });
      if (error) throw error;
    }

    // Save Delivery Settings
    if (delivery) {
      const deliveryPayload = {
        tenant_id: tenantId,
        campaign_id: activeId,
        send_mode: delivery.mode || 'now',
        throttle_per_minute: delivery.throttleRate || 300,
        quiet_hours: delivery.quietHoursEnabled !== false,
        business_hours: false,
        timezone: delivery.timezone || 'Asia/Kolkata',
        retry_failed: true,
        pause_on_failure: true
      };

      const { error } = await supabaseAdmin
        .from('broadcast_delivery_settings')
        .upsert(deliveryPayload, { onConflict: 'campaign_id' });
      if (error) throw error;
    }

    // Save Automation Rules
    if (automationRules) {
      await supabaseAdmin
        .from('broadcast_automation_rules')
        .delete()
        .eq('campaign_id', activeId);

      const rulesPayload = automationRules.map((r: any) => ({
        tenant_id: tenantId,
        campaign_id: activeId,
        trigger_type: r.trigger,
        action_type: r.action,
        delay_minutes: r.delay || 0,
        enabled: r.enabled
      }));

      if (rulesPayload.length > 0) {
        const { error } = await supabaseAdmin
          .from('broadcast_automation_rules')
          .insert(rulesPayload);
        if (error) throw error;
      }
    }

    console.log('[BROADCAST_SAVE] Success — campaignId:', activeId);
    return NextResponse.json({ success: true, campaignId: activeId });
  } catch (error) {
    console.error('[BROADCAST_SAVE] Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message || 'Failed to save campaign' }, { status: 500 });
  }
}
