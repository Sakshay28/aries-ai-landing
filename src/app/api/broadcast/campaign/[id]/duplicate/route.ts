import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
function cleanCampaignName(name: string): { display: string; isRetarget: boolean } {
  if (name.startsWith('__retarget:')) {
    const endIdx = name.indexOf('__:');
    if (endIdx !== -1) return { display: name.slice(endIdx + 3), isRetarget: true };
  }
  return { display: name, isRetarget: false };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: sourceCampaignId } = await params;

    // 1. Fetch source campaign
    const { data: sourceCamp, error: campErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', sourceCampaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (campErr || !sourceCamp) {
      return NextResponse.json({ success: false, error: 'Source campaign not found' }, { status: 404 });
    }

    const cleaned = cleanCampaignName(sourceCamp.name || 'Campaign');
    const baseName = cleaned.display.replace(/ \(Copy( \d+)?\)$/, '');
    const newName = `${baseName} (Copy)`;
    const now = new Date().toISOString();

    // 2. Insert duplicated campaign in draft state
    const { data: newCamp, error: createErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .insert({
        tenant_id: tenantId,
        name: newName,
        status: 'draft',
        template_name: sourceCamp.template_name || '',
        template_category: sourceCamp.template_category || 'MARKETING',
        template_language: sourceCamp.template_language || 'en',
        header_media_url: sourceCamp.header_media_url || null,
        delivery_mode: sourceCamp.delivery_mode || 'now',
        scheduled_for: null,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (createErr || !newCamp) {
      throw new Error(createErr?.message || 'Failed to create duplicate campaign');
    }

    const newCampaignId = newCamp.id;

    // 3. Duplicate audience configuration (CRITICAL: preserve manual contact IDs, filters, etc.)
    const { data: sourceAudience } = await supabaseAdmin
      .from('broadcast_audiences')
      .select('*')
      .eq('campaign_id', sourceCampaignId)
      .maybeSingle();

    if (sourceAudience) {
      await supabaseAdmin
        .from('broadcast_audiences')
        .insert({
          tenant_id: tenantId,
          campaign_id: newCampaignId,
          audience_type: sourceAudience.audience_type,
          tag_ids: sourceAudience.tag_ids || [],
          csv_upload_id: sourceAudience.csv_upload_id || null,
          contact_count: sourceAudience.contact_count || 0,
          filters: sourceAudience.filters || {},
          created_at: now,
        });
    }

    // 4. Duplicate variable mappings
    const { data: sourceVars } = await supabaseAdmin
      .from('broadcast_variable_mapping')
      .select('*')
      .eq('campaign_id', sourceCampaignId);

    if (sourceVars && sourceVars.length > 0) {
      const varsPayload = sourceVars.map((v) => ({
        tenant_id: tenantId,
        campaign_id: newCampaignId,
        variable_key: v.variable_key,
        source_type: v.source_type,
        crm_field: v.crm_field || null,
        custom_value: v.custom_value || null,
      }));
      await supabaseAdmin.from('broadcast_variable_mapping').insert(varsPayload);
    }

    // 5. Duplicate delivery settings
    const { data: sourceDelivery } = await supabaseAdmin
      .from('broadcast_delivery_settings')
      .select('*')
      .eq('campaign_id', sourceCampaignId)
      .maybeSingle();

    if (sourceDelivery) {
      await supabaseAdmin
        .from('broadcast_delivery_settings')
        .insert({
          tenant_id: tenantId,
          campaign_id: newCampaignId,
          send_mode: sourceDelivery.send_mode || 'now',
          throttle_per_minute: sourceDelivery.throttle_per_minute || 300,
          quiet_hours: sourceDelivery.quiet_hours === true,
          business_hours: sourceDelivery.business_hours === true,
          timezone: sourceDelivery.timezone || 'Asia/Kolkata',
          retry_failed: sourceDelivery.retry_failed !== false,
          pause_on_failure: sourceDelivery.pause_on_failure !== false,
          created_at: now,
        });
    }

    // 6. Duplicate automation rules
    const { data: sourceRules } = await supabaseAdmin
      .from('broadcast_automation_rules')
      .select('*')
      .eq('campaign_id', sourceCampaignId);

    if (sourceRules && sourceRules.length > 0) {
      const rulesPayload = sourceRules.map((r) => ({
        tenant_id: tenantId,
        campaign_id: newCampaignId,
        trigger_type: r.trigger_type,
        action_type: r.action_type,
        delay_minutes: r.delay_minutes || null,
        enabled: r.enabled !== false,
        created_at: now,
      }));
      await supabaseAdmin.from('broadcast_automation_rules').insert(rulesPayload);
    }

    return NextResponse.json({
      success: true,
      campaignId: newCampaignId,
      campaign: newCamp,
    });
  } catch (error: any) {
    console.error('[BROADCAST_DUPLICATE] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to duplicate campaign' },
      { status: 500 }
    );
  }
}
