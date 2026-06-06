// ═══════════════════════════════════════════════════════════
// 🗂️ Meta Ads — Connected Assets (ad accounts, pages, WA numbers)
// ═══════════════════════════════════════════════════════════
// GET   → list all connected assets
// PATCH → select/deselect a specific asset
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireUser, requireWrite, errorResponse } from '@/lib/meta-ads/guard';
import { selectAccountSchema } from '@/lib/meta-ads/validation';

export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    const [adAccounts, pages, waNumbers] = await Promise.all([
      supabaseAdmin
        .from('meta_ad_accounts')
        .select('id, account_id, account_name, currency, timezone, account_status, is_selected')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('meta_pages')
        .select('id, page_id, page_name, instagram_id, is_selected')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('meta_whatsapp_numbers')
        .select('id, waba_id, phone_number_id, display_phone, verified_name, quality_rating, is_selected')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),
    ]);

    return NextResponse.json({
      ad_accounts: adAccounts.data || [],
      pages: pages.data || [],
      whatsapp_numbers: waNumbers.data || [],
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const TABLE_MAP = {
  ad_account: 'meta_ad_accounts',
  page: 'meta_pages',
  whatsapp_number: 'meta_whatsapp_numbers',
} as const;

export async function PATCH(req: NextRequest) {
  try {
    const guard = await requireWrite();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    const body = await req.json();
    const parsed = selectAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { account_id, type } = parsed.data;
    const table = TABLE_MAP[type];

    // Deselect all of this type, then select the chosen one (single-select per type)
    await supabaseAdmin.from(table).update({ is_selected: false }).eq('tenant_id', tenantId);

    const { error } = await supabaseAdmin
      .from(table)
      .update({ is_selected: true })
      .eq('tenant_id', tenantId)
      .eq('id', account_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
