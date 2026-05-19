import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { decryptToken } from '@/lib/utils/crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

const GUPSHUP_BASE = 'https://api.gupshup.io/wa/api/v1';

export async function GET() {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('gupshup_api_key, gupshup_app_name')
      .eq('id', tenantId)
      .single();

    if (!tenant?.gupshup_api_key || !tenant?.gupshup_app_name) {
      return NextResponse.json({ success: true, data: [] });
    }

    const apiKey = decryptToken(tenant.gupshup_api_key as string) as string;

    const res = await fetch(
      `${GUPSHUP_BASE}/templates?appName=${encodeURIComponent(tenant.gupshup_app_name as string)}`,
      { headers: { apikey: apiKey, 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      console.error('Gupshup templates list error:', res.status, errText.slice(0, 200));
      return NextResponse.json({ success: false, error: 'Failed to fetch templates' }, { status: 502 });
    }

    const json = await res.json();
    const raw: Record<string, unknown>[] = json.templates || json.data || [];

    const data = raw.map((t) => ({
      id: (t.id as string) || '',
      name: (t.elementName as string) || '',
      category: (t.category as string) || '',
      language: (t.languageCode as string) || '',
      status: (t.status as string) || '',
      components: (t.components as unknown[]) || [],
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('gupshup_api_key, gupshup_app_name')
      .eq('id', tenantId)
      .single();

    if (!tenant?.gupshup_api_key || !tenant?.gupshup_app_name) {
      return NextResponse.json({ success: false, error: 'WhatsApp is not yet active for your account. Contact support.' }, { status: 400 });
    }

    const apiKey = decryptToken(tenant.gupshup_api_key as string) as string;
    const body = await request.json();

    const params = new URLSearchParams({
      appId: tenant.gupshup_app_name as string,
      elementName: body.name as string,
      category: (body.category as string) || 'MARKETING',
      languageCode: (body.language as string) || 'en',
      components: JSON.stringify(body.components || []),
    });

    const res = await fetch(`${GUPSHUP_BASE}/template`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = (json as { message?: string }).message || `Error ${res.status}`;
      return NextResponse.json({ success: false, error: errMsg }, { status: 502 });
    }

    return NextResponse.json({ success: true, data: json });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
