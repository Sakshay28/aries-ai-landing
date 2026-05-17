import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      business_name,
      business_type,
      business_phone,
      bot_name,
      bot_personality,
      welcome_message,
      whatsapp_number_requested,
    } = body;

    if (!business_name?.trim()) {
      return NextResponse.json({ success: false, error: 'Business name is required.' }, { status: 400 });
    }
    if (!bot_name?.trim()) {
      return NextResponse.json({ success: false, error: 'Bot name is required.' }, { status: 400 });
    }

    // Build welcome message if not provided
    const finalWelcome = welcome_message?.trim() ||
      `Hey! 👋 Welcome to ${business_name.trim()}! How can I help you today?`;

    // Save to tenants table
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({
        business_name: business_name.trim(),
        business_type: business_type || 'Other',
        business_phone: business_phone || null,
        bot_name: bot_name.trim(),
        bot_personality: bot_personality || 'Friendly and approachable',
        welcome_message: finalWelcome,
        // Store WhatsApp number request (admin will provision manually)
        gupshup_phone_number: whatsapp_number_requested
          ? whatsapp_number_requested.replace(/[\s+\-()]/g, '')
          : null,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (error) {
      console.error('Onboard save error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Fire analytics event
    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenantId,
      event_type: 'onboarding_completed',
      metadata: {
        business_name: business_name.trim(),
        business_type,
        bot_name: bot_name.trim(),
        whatsapp_requested: !!whatsapp_number_requested,
      },
    }).catch(() => {}); // Non-critical

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Onboard API error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}
