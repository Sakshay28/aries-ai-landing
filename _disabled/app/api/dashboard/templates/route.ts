import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { decryptToken } from '@/lib/utils/crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import axios from 'axios';

export async function GET() {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_business_account_id, wa_access_token')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_business_account_id || !tenant?.wa_access_token) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });
    }

    const waToken = decryptToken(tenant.wa_access_token);
    const url = `https://graph.facebook.com/v21.0/${tenant.wa_business_account_id}/message_templates`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${waToken}` }
    });

    return NextResponse.json({ success: true, data: data.data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error'; return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_business_account_id, wa_access_token')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_business_account_id || !tenant?.wa_access_token) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });
    }

    const body = await request.json();
    const url = `https://graph.facebook.com/v21.0/${tenant.wa_business_account_id}/message_templates`;
    
    const { data } = await axios.post(url, body, {
      headers: { 
        Authorization: `Bearer ${decryptToken(tenant.wa_access_token)}`,
        'Content-Type': 'application/json'
      }
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    type AxiosLike = { response?: { data?: { error?: { message?: string } } }; message?: string };
    const axErr = error as AxiosLike;
    const message = axErr?.response?.data?.error?.message || axErr?.message || 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
