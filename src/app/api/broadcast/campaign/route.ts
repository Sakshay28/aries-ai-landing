import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

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
    const { 
      campaignId, 
      campaignName, 
      templateName, 
      templateCategory, 
      deliveryMode, 
      scheduledAt,
      audience,
      delivery,
      variables,
      automationRules
    } = body;

    if (!campaignName) {
      return NextResponse.json({ success: false, error: 'Campaign name required' }, { status: 400 });
    }

    const campaignPayload = {
      tenant_id: tenantId,
      name: campaignName,
      template_name: templateName || '',
      template_category: templateCategory || 'MARKETING',
      delivery_mode: deliveryMode || 'now',
      scheduled_for: scheduledAt || null,
      status: 'draft',
      updated_at: new Date().toISOString()
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

    return NextResponse.json({ success: true, campaignId: activeId });
  } catch (error) {
    console.error('API Campaign POST Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message || 'Failed to save campaign' }, { status: 500 });
  }
}
