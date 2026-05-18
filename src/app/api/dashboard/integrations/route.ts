import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { encryptToken, decryptToken } from '@/lib/utils/crypto';

const SENSITIVE_KEYS = ['key_secret', 'password', 'access_token', 'refresh_token', 'service_account_key'];

function encryptConfig(config: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    out[k] = v && SENSITIVE_KEYS.includes(k) ? (encryptToken(v) as string) : v;
  }
  return out;
}

function redactConfig(config: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    if (v && SENSITIVE_KEYS.includes(k)) {
      const dec = decryptToken(v) as string | null;
      out[k] = dec ? '••••••••' : '';
    } else {
      out[k] = v;
    }
  }
  return out;
}

// GET — list all integrations for this tenant
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('tenant_integrations')
    .select('integration_id, config, is_active, connected_at')
    .eq('tenant_id', tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data || []).map(row => ({
    integration_id: row.integration_id,
    is_active: row.is_active,
    connected_at: row.connected_at,
    config: redactConfig(row.config as Record<string, string>),
  }));

  return NextResponse.json({ integrations: result });
}

// PUT — upsert integration config
export async function PUT(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { integration_id, config } = await req.json();
  if (!integration_id || !config) {
    return NextResponse.json({ error: 'Missing integration_id or config' }, { status: 400 });
  }

  const encrypted = encryptConfig(config as Record<string, string>);

  const { error } = await supabaseAdmin
    .from('tenant_integrations')
    .upsert(
      {
        tenant_id: tenantId,
        integration_id,
        config: encrypted,
        is_active: true,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,integration_id' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE — disconnect an integration
export async function DELETE(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const integration_id = searchParams.get('id');
  if (!integration_id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('tenant_integrations')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('integration_id', integration_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
