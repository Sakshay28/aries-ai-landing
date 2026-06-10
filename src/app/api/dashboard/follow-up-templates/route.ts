import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

const VALID_TYPES = ['30min', '3hr', '24hr', '7day'];

// GET — return all 4 follow-up templates for the current tenant
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('follow_up_templates')
    .select('follow_up_type, message, media_url, media_type')
    .eq('tenant_id', tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return as a keyed map so the UI can do templates['30min'].message etc.
  const map: Record<string, { message: string; media_url: string; media_type: string }> = {};
  for (const row of (data || [])) {
    map[row.follow_up_type] = {
      message:   row.message   || '',
      media_url: row.media_url || '',
      media_type: row.media_type || 'image',
    };
  }

  return NextResponse.json({ success: true, data: map });
}

// PATCH — upsert a single follow-up template
export async function PATCH(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { follow_up_type, message, media_url, media_type } = body;

  if (!VALID_TYPES.includes(follow_up_type)) {
    return NextResponse.json({ error: 'Invalid follow_up_type' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('follow_up_templates')
    .upsert(
      {
        tenant_id:      tenantId,
        follow_up_type,
        message:        message    || null,
        media_url:      media_url  || null,
        media_type:     media_type || 'image',
      },
      { onConflict: 'tenant_id,follow_up_type' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
