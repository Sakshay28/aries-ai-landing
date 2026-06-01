import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { sendTemplateMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { templateName, variables } = await req.json();
    if (!templateName) {
      return NextResponse.json({ success: false, error: 'templateName required' }, { status: 400 });
    }

    // Get tenant config
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_phone_number_id, staff_phone')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp is not yet active for your account. Contact support.'
      }, { status: 400 });
    }

    if (!tenant.staff_phone) {
      return NextResponse.json({
        success: false,
        error: 'No staff phone number set in Settings. Please set one to receive test sends.'
      }, { status: 400 });
    }

    // Map variables object (e.g. { '1': 'Sakshay', '2': 'SKY-2045' }) to an ordered array of parameter strings
    const orderedVars: string[] = [];
    if (variables && typeof variables === 'object') {
      const keys = Object.keys(variables).sort((a, b) => Number(a) - Number(b));
      for (const key of keys) {
        orderedVars.push(String(variables[key]));
      }
    }

    const decryptedApiKey = decryptToken(tenant.wa_access_token as string) as string;

    // Send the test template message using the Meta API
    const result = await sendTemplateMessage(
      decryptedApiKey,
      tenant.wa_phone_number_id as string,
      tenant.staff_phone,
      templateName,
      orderedVars,
      'en' // default to English for test messages
    );

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    console.error('Broadcast test send error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test message'
    }, { status: 500 });
  }
}
