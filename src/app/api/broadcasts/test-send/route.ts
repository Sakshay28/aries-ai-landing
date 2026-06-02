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

    const body = await req.json();
    const { templateName, languageCode, variables, phoneNumber } = body;

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
        error: 'WhatsApp is not connected. Go to Settings → link your Meta Business account.',
      }, { status: 400 });
    }

    // Resolve destination phone:
    // 1. explicit phoneNumber from request body (from test dialog)
    // 2. fall back to staff_phone on tenant
    const destination = (phoneNumber || '').toString().replace(/\D/g, '') ||
                        (tenant.staff_phone || '').toString().replace(/\D/g, '');

    if (!destination || destination.length < 10) {
      return NextResponse.json({
        success: false,
        error: 'No test phone number available. Enter a phone number in the test dialog or set Staff Phone in Settings.',
      }, { status: 400 });
    }

    // Build ordered variable array from the variables object
    const orderedVars: string[] = [];
    if (variables && typeof variables === 'object') {
      const keys = Object.keys(variables).sort((a, b) => Number(a) - Number(b));
      for (const key of keys) {
        orderedVars.push(String(variables[key]));
      }
    }

    const decryptedToken = decryptToken(tenant.wa_access_token as string) as string;

    console.log(`[BROADCAST_TEST] Sending test → ${destination} template="${templateName}"`);

    const result = await sendTemplateMessage(
      decryptedToken,
      tenant.wa_phone_number_id as string,
      destination,
      templateName,
      orderedVars,
      languageCode || 'en',
    );

    console.log(`[BROADCAST_TEST] Success — messageId=${result.messageId}`);
    return NextResponse.json({ success: true, messageId: result.messageId });

  } catch (error: any) {
    console.error('[BROADCAST_TEST] Error:', error.message);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to send test message',
    }, { status: 500 });
  }
}
